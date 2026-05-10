"""Base agent class for all Groupio agents."""

import asyncio
import hashlib
import json
import logging
import re
import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from src.models.agent_state import AgentState
from src.rag.pipeline import get_rag_pipeline
from src.utils.llm_client import get_llm_client

logger = logging.getLogger(__name__)


class AgentConfig(BaseModel):
    """Configuration for an agent."""

    name: str
    description: str
    system_prompt: str
    tools: list[str] = Field(default_factory=list)
    rag_enabled: bool = True
    model: str = "claude-sonnet-4-20250514"
    temperature: float = 0.7
    max_tokens: int = 2000


class CircuitBreaker:
    """Simple circuit breaker for external service calls."""

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0) -> None:
        self._failure_count = 0
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._last_failure_time: float | None = None
        self._state = "closed"  # closed, open, half-open

    @property
    def is_open(self) -> bool:
        if self._state == "open" and self._last_failure_time is not None:
            import time

            if time.time() - self._last_failure_time >= self._recovery_timeout:
                self._state = "half-open"
                return False
        return self._state == "open"

    def record_success(self) -> None:
        self._failure_count = 0
        self._state = "closed"

    def record_failure(self) -> None:
        import time

        self._failure_count += 1
        self._last_failure_time = time.time()
        if self._failure_count >= self._failure_threshold:
            self._state = "open"


# Transient errors that should be retried
TRANSIENT_ERRORS = (TimeoutError, ConnectionError, OSError)


# Module-level circuit breaker for LLM calls
_llm_circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60.0)


class LLMResponseCache:
    """Semantic cache for LLM responses using Redis.

    Caches responses keyed by a hash of the model, system prompt, and messages.
    This avoids repeated LLM calls for identical queries.
    """

    def __init__(self, default_ttl: int = 3600) -> None:
        self._default_ttl = default_ttl

    @staticmethod
    def _make_key(model: str, system: str, messages: list[dict[str, Any]]) -> str:
        """Create a deterministic cache key from the LLM call parameters."""
        raw = json.dumps({"model": model, "system": system, "messages": messages}, sort_keys=True, default=str)
        return f"llm_cache:{hashlib.sha256(raw.encode()).hexdigest()}"

    async def get(self, model: str, system: str, messages: list[dict[str, Any]]) -> dict[str, Any] | None:
        """Retrieve a cached LLM response, or None if not cached."""
        try:
            from src.databases.redis_client import get_redis_client

            redis = get_redis_client()
            key = self._make_key(model, system, messages)
            cached = await redis.cache_get(key)
            if cached:
                logger.debug("LLM cache hit for key %s", key[:30])
                return cached
        except Exception:
            pass  # Cache miss on error
        return None

    async def set(
        self,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        response: dict[str, Any],
        ttl: int | None = None,
    ) -> None:
        """Store an LLM response in the cache."""
        try:
            from src.databases.redis_client import get_redis_client

            redis = get_redis_client()
            key = self._make_key(model, system, messages)
            await redis.cache_set(key, response, ttl=ttl or self._default_ttl)
        except Exception:
            pass  # Don't fail on cache errors


_llm_cache = LLMResponseCache(default_ttl=1800)  # 30 min default

# Agents whose decisions require human review in recommend mode
_REVIEW_AGENTS: frozenset[str] = frozenset({"matching", "pricing", "vetting", "influencer"})

_THINKING_RE = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)


def _extract_thinking_blocks(response: dict[str, Any]) -> list[str]:
    """Extract <thinking> tag contents from a Claude extended-thinking response."""
    blocks: list[str] = []
    for block in response.get("content", []):
        if block.get("type") == "thinking":
            blocks.append(block.get("thinking", ""))
        elif block.get("type") == "text":
            for m in _THINKING_RE.finditer(block.get("text", "")):
                blocks.append(m.group(1).strip())
    return blocks


class BaseAgent(ABC):
    """Base class for all Groupio agents.

    Provides common functionality for RAG retrieval, LLM calls,
    and tool management.
    """

    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.llm_client = get_llm_client()
        self.rag = get_rag_pipeline() if config.rag_enabled else None
        self._metrics: dict[str, int] = {"calls": 0, "errors": 0, "tokens": 0}

    async def run(self, state: AgentState) -> AgentState:
        """Execute agent logic with timing and audit persistence.

        Wraps _run_impl with timing and calls _persist_audit on completion,
        including when _run_impl raises so exceptions are always audited.
        """
        start = time.perf_counter()
        exc_caught: BaseException | None = None
        result: AgentState = state
        try:
            result = await self._run_impl(state)
        except Exception as exc:
            exc_caught = exc
            self._metrics["errors"] += 1

        latency_ms = int((time.perf_counter() - start) * 1000)
        input_summary = self._get_last_user_message(state)

        if exc_caught is not None:
            action = "error"
            output_summary = f"ERROR: {type(exc_caught).__name__}: {exc_caught}"
        else:
            actions = result.get("actions_taken", [])
            last_action = actions[-1] if actions else {}
            action = last_action.get("action", "run")
            resp = last_action.get("response") or {}
            msg = resp.get("message", "") if isinstance(resp.get("message"), str) else ""
            output_summary = msg or last_action.get("summary_for_next_agent", "") or ""
            if not output_summary and result.get("intent"):
                output_summary = f"intent={result.get('intent')}"

        tokens_used = self._metrics.get("tokens", 0)
        self._persist_audit(
            state=result,
            action=action,
            input_summary=input_summary,
            output_summary=output_summary,
            latency_ms=latency_ms,
            tokens_used=tokens_used,
        )

        if exc_caught is not None:
            raise exc_caught
        return result

    @abstractmethod
    async def _run_impl(self, state: AgentState) -> AgentState:
        """Execute agent logic. Must be implemented by each concrete agent."""
        ...

    async def _retrieve_context(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None = None,
        top_k: int = 10,
        strategy: str = "semantic",
    ) -> list[dict[str, Any]]:
        """Retrieve relevant context from the RAG pipeline.

        Returns an empty list rather than raising when Qdrant is unreachable
        or the collection does not yet exist, so agents degrade gracefully.
        """
        if not self.rag:
            return []
        try:
            return await self.rag.retrieve(
                query=query,
                namespace=namespace,
                filters=filters,
                top_k=top_k,
                strategy=strategy,
            )
        except Exception as exc:
            logger.warning(
                "RAG retrieve failed (namespace=%s strategy=%s): %s — continuing without context",
                namespace,
                strategy,
                exc,
            )
            return []

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(TRANSIENT_ERRORS),
        reraise=True,
    )
    async def _call_llm(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        """Call Claude API with messages and optional tools.

        Includes retry with exponential backoff for transient errors
        and circuit breaker to prevent cascading failures.
        """
        if _llm_circuit_breaker.is_open:
            logger.warning("LLM circuit breaker is open, failing fast for agent %s", self.config.name)
            raise ConnectionError("LLM service circuit breaker is open")

        # Check cache first
        system_prompt = system or self.config.system_prompt
        cached = await _llm_cache.get(self.config.model, system_prompt, messages)
        if cached is not None:
            return cached

        try:
            response = await self.llm_client.create_message(
                model=self.config.model,
                max_tokens=self.config.max_tokens,
                temperature=temperature if temperature is not None else self.config.temperature,
                system=system or self.config.system_prompt,
                messages=messages,
                tools=tools,
            )

            _llm_circuit_breaker.record_success()

            # Cache the response
            await _llm_cache.set(self.config.model, system_prompt, messages, response)

            # Track token usage
            usage = response.get("usage", {})
            self._metrics["tokens"] += usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

            return response
        except TRANSIENT_ERRORS:
            _llm_circuit_breaker.record_failure()
            raise
        except Exception as exc:
            # Permanent errors: don't retry, but track
            self._metrics["errors"] += 1
            logger.error("Permanent LLM error in agent %s: %s", self.config.name, type(exc).__name__)
            raise

    def _persist_audit(
        self,
        state: "AgentState",
        action: str,
        input_summary: str,
        output_summary: str,
        latency_ms: int,
        tokens_used: int = 0,
        reasoning_chain: list[str] | None = None,
        cited_sources: list[str] | None = None,
        alternatives_considered: list[dict] | None = None,
    ) -> None:
        """Fire-and-forget persistence of an agent decision to agent_audit_log."""
        # Agents that make consequential decisions require human review
        requires_review = self.config.name.lower() in _REVIEW_AGENTS

        async def _write() -> None:
            try:
                from src.databases.postgres import get_postgres_client

                db = get_postgres_client()
                await db.create_agent_audit_entry(
                    {
                        "id": str(uuid4()),
                        "session_id": state.get("conversation_id"),
                        "user_id": state.get("user_id"),
                        "agent_name": self.config.name,
                        "action": action,
                        "input_summary": input_summary[:500],
                        "output_summary": output_summary[:500],
                        "model_used": self.config.model,
                        "tokens_used": tokens_used,
                        "latency_ms": latency_ms,
                        "requires_human_review": requires_review,
                        "reasoning_chain": reasoning_chain or [],
                        "cited_sources": cited_sources or [],
                        "alternatives_considered": alternatives_considered or [],
                        "created_at": datetime.now(UTC),
                    }
                )
            except Exception as exc:
                logger.warning("agent_audit_log write failed: %s", exc)

        asyncio.create_task(_write())
        asyncio.create_task(self._persist_metrics())

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(TRANSIENT_ERRORS),
        reraise=True,
    )
    async def _call_llm_structured(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call Claude API expecting structured JSON output."""
        if _llm_circuit_breaker.is_open:
            raise ConnectionError("LLM service circuit breaker is open")
        try:
            result = await self.llm_client.create_structured_output(
                messages=messages,
                system=system or self.config.system_prompt,
                output_schema=output_schema,
            )
            _llm_circuit_breaker.record_success()
            return result
        except TRANSIENT_ERRORS:
            _llm_circuit_breaker.record_failure()
            raise

    def _get_last_user_message(self, state: AgentState) -> str:
        """Extract the last user message from state."""
        for msg in reversed(state.get("messages", [])):
            if msg.get("role") == "user":
                return msg.get("content", "")
        return ""

    def _safe_format_value(self, value: Any) -> str:
        """Convert a state value to a string for prompt insertion. Never raises."""
        if value is None:
            return "N/A"
        if isinstance(value, str):
            return value
        if isinstance(value, (list, dict)):
            try:
                return json.dumps(value, ensure_ascii=False, default=str)
            except (TypeError, ValueError):
                return str(value)
        return str(value)

    def _build_system_prompt(self, state: AgentState) -> str:
        """Build the system prompt with state context. All placeholders have safe defaults."""
        safe = {
            "user_profile": self._safe_format_value(state.get("user_profile") or {}),
            "building_context": self._safe_format_value(state.get("building_context") or {}),
            "active_offers": self._safe_format_value(state.get("active_offers") or []),
            "rag_context": self._safe_format_value(state.get("rag_results") or []),
            "conversation_history": self._safe_format_value(state.get("messages") or []),
        }
        try:
            return self.config.system_prompt.format(**safe)
        except KeyError as e:
            logger.warning("System prompt uses unknown placeholder %s; substituting N/A", e)

            class SafeDict(dict):
                def __missing__(self, k: str) -> str:
                    return "N/A"

            return self.config.system_prompt.format_map(SafeDict(safe))

    async def reload_config(self) -> None:
        """Reload agent configuration — hot-reloads system prompt from system_settings if overridden."""
        logger.info("Reloading config for agent: %s", self.config.name)
        try:
            from src.databases.postgres import get_postgres_client

            db = get_postgres_client()
            override = await db.get_agent_system_prompt(self.config.name)
            if override:
                self.config.system_prompt = override
                logger.info("Agent %s: system prompt reloaded from system_settings", self.config.name)
            else:
                logger.info("Agent %s: no system prompt override in system_settings, keeping current", self.config.name)
        except Exception as exc:
            logger.warning("Agent %s: reload_config failed: %s", self.config.name, exc)

    async def get_metrics(self) -> dict[str, Any]:
        """Get agent execution metrics, including persisted historical totals from DB."""
        snapshot = {"name": self.config.name, **self._metrics}
        try:
            from src.databases.postgres import get_postgres_client

            db = get_postgres_client()
            history = await db.get_agent_metrics_history(self.config.name, limit=1000)
            if history:
                aggregated: dict[str, float] = {}
                for row in history:
                    mt = row.get("metric_type", "")
                    val = float(row.get("value", 0))
                    aggregated[mt] = aggregated.get(mt, 0.0) + val
                snapshot["historical"] = aggregated
        except Exception as exc:
            logger.debug("Agent %s: could not load historical metrics: %s", self.config.name, exc)
        return snapshot

    async def _enqueue_pending_decision(
        self,
        state: "AgentState",
        action_type: str,
        payload: dict[str, Any],
        escalation_reason: str,
    ) -> None:
        """Persist a pending decision to the DB for admin review/approval."""
        try:
            from src.databases.postgres import get_postgres_client

            db = get_postgres_client()
            record = {
                "id": str(uuid4()),
                "agent_name": self.config.name,
                "conversation_id": state.get("conversation_id"),
                "user_id": state.get("user_id"),
                "action_type": action_type,
                "payload": payload,
                "escalation_reason": escalation_reason,
                "status": "pending",
                "created_at": datetime.now(UTC),
            }
            await db.create_pending_decision(record)
        except Exception as exc:
            logger.warning("Agent %s: failed to enqueue pending decision: %s", self.config.name, exc)

    async def _persist_metrics(self) -> None:
        """Snapshot current in-memory metrics to the agent_metrics DB table."""
        try:
            from src.databases.postgres import get_postgres_client

            db = get_postgres_client()
            await db.record_agent_metrics(self.config.name, self._metrics)
        except Exception as exc:
            logger.debug("Agent %s: metrics persistence failed: %s", self.config.name, exc)
