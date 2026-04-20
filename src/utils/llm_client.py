"""Claude API wrapper for LLM interactions."""

import asyncio
import json
import logging
import time
from typing import Any

import httpx
from anthropic import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncAnthropic,
    RateLimitError,
)
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class LLMServiceBusyError(RuntimeError):
    """Raised when the upstream LLM is overloaded and all retries are exhausted.

    Routes/agents can catch this to emit a 503 or degrade gracefully instead of
    surfacing raw Anthropic errors to end users.
    """


# Statuses we always retry on: 408, 425, 429, 500, 502, 503, 504, and Anthropic's 529 "overloaded".
_RETRYABLE_STATUSES: frozenset[int] = frozenset({408, 425, 429, 500, 502, 503, 504, 529})


def _should_retry(exc: BaseException) -> bool:
    """Predicate for Tenacity: retry on rate-limits, server errors, and network/timeout blips."""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APIStatusError):
        return int(getattr(exc, "status_code", 0) or 0) in _RETRYABLE_STATUSES
    if isinstance(exc, (APIConnectionError, APITimeoutError, asyncio.TimeoutError, httpx.TimeoutException)):
        return True
    return False


class _TokenBucket:
    """Minimal async token-bucket rate limiter.

    Enforces an upper bound of ``rate`` requests/sec to the Anthropic API with
    a burst allowance of ``capacity``. Cheap enough to hold while awaiting the
    upstream call since it only uses an asyncio lock.
    """

    def __init__(self, rate: float, capacity: int) -> None:
        self._rate = float(rate)
        self._capacity = int(capacity)
        self._tokens: float = float(capacity)
        self._updated_at: float = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                elapsed = now - self._updated_at
                if elapsed > 0:
                    self._tokens = min(self._capacity, self._tokens + elapsed * self._rate)
                    self._updated_at = now
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                deficit = 1.0 - self._tokens
                sleep_for = deficit / self._rate if self._rate > 0 else 0.1
            await asyncio.sleep(max(sleep_for, 0.01))


class LLMClient:
    """Wrapper around the Anthropic Claude API."""

    def __init__(self) -> None:
        settings = get_settings()
        # max_retries=0 → defer retry policy to our Tenacity decorator (see
        # ``_should_retry``) so we don't double-retry; explicit httpx timeout
        # prevents hangs at the transport layer.
        self._client = AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=httpx.Timeout(60.0, connect=10.0),
            max_retries=0,
        )
        self._model = settings.PRIMARY_MODEL
        self._fallback_model = settings.FALLBACK_MODEL
        self._max_tokens = settings.MAX_TOKENS
        self._temperature = settings.TEMPERATURE
        self._timeout_secs = settings.LLM_TIMEOUT_SECONDS
        # ~10 rps steady, burst to 15. Tunable via settings later if needed.
        self._rate_limiter = _TokenBucket(rate=10.0, capacity=15)

    @retry(
        retry=retry_if_exception(_should_retry),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def create_message(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        tools: list[dict[str, Any]] | None = None,
        use_fallback: bool = False,
    ) -> dict[str, Any]:
        """Send a message to Claude and get a response.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            system: Optional system prompt.
            model: Override the default model.
            max_tokens: Override the default max tokens.
            temperature: Override the default temperature.
            tools: Optional list of tool definitions for function calling.
            use_fallback: If True, use the fallback model instead of primary.

        Returns:
            Response dict with 'content', 'model', 'usage', etc.
        Raises:
            asyncio.TimeoutError: If the LLM call exceeds LLM_TIMEOUT_SECONDS.
        """
        selected_model = model or (self._fallback_model if use_fallback else self._model)
        kwargs: dict[str, Any] = {
            "model": selected_model,
            "max_tokens": max_tokens or self._max_tokens,
            "messages": messages,
        }

        if system:
            kwargs["system"] = system
        if temperature is not None:
            kwargs["temperature"] = temperature
        else:
            kwargs["temperature"] = self._temperature
        if tools:
            kwargs["tools"] = tools

        await self._rate_limiter.acquire()
        try:
            response = await asyncio.wait_for(
                self._client.messages.create(**kwargs),
                timeout=self._timeout_secs,
            )
        except APIStatusError as exc:
            status = int(getattr(exc, "status_code", 0) or 0)
            if status == 529:
                # Anthropic "overloaded" — surface a friendly, structured error
                # to callers so they can pick between fallback/degradation.
                logger.warning("Anthropic 529 overloaded on model %s; retries exhausted", selected_model)
                raise LLMServiceBusyError("LLM upstream is overloaded; try again shortly") from exc
            raise
        except TimeoutError:
            if not use_fallback and self._fallback_model and self._fallback_model != selected_model:
                logger.warning(
                    "LLM timeout after %ss on model %s — falling back to %s",
                    self._timeout_secs,
                    selected_model,
                    self._fallback_model,
                )
                return await self.create_message(
                    messages=messages,
                    system=system,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    tools=tools,
                    use_fallback=True,
                )
            raise

        return {
            "content": [
                {"type": block.type, "text": getattr(block, "text", "")}
                if block.type == "text"
                else {
                    "type": block.type,
                    "id": getattr(block, "id", ""),
                    "name": getattr(block, "name", ""),
                    "input": getattr(block, "input", {}),
                }
                for block in response.content
            ],
            "model": response.model,
            "stop_reason": response.stop_reason,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
        }

    async def create_structured_output(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Get a structured JSON response from Claude.

        Instructs Claude to return valid JSON matching the given schema.
        """
        schema_instruction = ""
        if output_schema:
            schema_instruction = (
                f"\n\nYou must respond with valid JSON matching this schema:\n{json.dumps(output_schema, indent=2)}"
            )

        full_system = (system or "") + schema_instruction
        full_system += "\n\nRespond ONLY with valid JSON, no other text."

        response = await self.create_message(
            messages=messages,
            system=full_system,
            temperature=0.0,
        )

        text = self._extract_text(response)

        try:
            # Try to parse the full response as JSON
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from the response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start:end])
                except json.JSONDecodeError:
                    pass

            logger.warning("Could not parse structured output: %s", text[:200])
            return {"raw_response": text, "parse_error": True}

    async def analyze_sentiment(self, text: str) -> float:
        """Analyze sentiment of a text, returning a score from -1 to 1."""
        response = await self.create_message(
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analyze the sentiment of this text on a scale from "
                        f"-1.0 (very negative) to 1.0 (very positive). "
                        f"Return ONLY a number.\n\nText: {text}"
                    ),
                }
            ],
            temperature=0.0,
            max_tokens=10,
        )

        text_response = self._extract_text(response)
        try:
            score = float(text_response.strip())
            return max(-1.0, min(1.0, score))
        except ValueError:
            return 0.0

    @staticmethod
    def _extract_text(response: dict[str, Any]) -> str:
        """Extract text content from an API response."""
        content = response.get("content", [])
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text", "")
        return ""


_llm_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """Get or create the singleton LLMClient instance."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client
