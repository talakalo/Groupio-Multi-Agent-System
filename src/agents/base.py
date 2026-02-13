"""Base agent class for all Groupio agents."""

import json
import logging
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field

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

    @abstractmethod
    async def run(self, state: AgentState) -> AgentState:
        """Execute agent logic and return updated state.

        Must be implemented by each concrete agent.
        """
        ...

    async def _retrieve_context(
        self,
        query: str,
        namespace: str,
        filters: dict[str, Any] | None = None,
        top_k: int = 10,
        strategy: str = "semantic",
    ) -> list[dict[str, Any]]:
        """Retrieve relevant context from the RAG pipeline."""
        if not self.rag:
            return []
        return await self.rag.retrieve(
            query=query,
            namespace=namespace,
            filters=filters,
            top_k=top_k,
            strategy=strategy,
        )

    async def _call_llm(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        """Call Claude API with messages and optional tools."""
        response = await self.llm_client.create_message(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            temperature=temperature if temperature is not None else self.config.temperature,
            system=system or self.config.system_prompt,
            messages=messages,
            tools=tools,
        )

        # Track token usage
        usage = response.get("usage", {})
        self._metrics["tokens"] += usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return response

    async def _call_llm_structured(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call Claude API expecting structured JSON output."""
        return await self.llm_client.create_structured_output(
            messages=messages,
            system=system or self.config.system_prompt,
            output_schema=output_schema,
        )

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
        """Reload agent configuration (for hot-reloading prompts)."""
        logger.info("Reloading config for agent: %s", self.config.name)

    async def get_metrics(self) -> dict[str, Any]:
        """Get agent execution metrics."""
        return {
            "name": self.config.name,
            **self._metrics,
        }
