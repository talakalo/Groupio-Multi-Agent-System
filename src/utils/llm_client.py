"""Claude API wrapper for LLM interactions."""

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Wrapper around the Anthropic Claude API."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._model = settings.PRIMARY_MODEL
        self._max_tokens = settings.MAX_TOKENS
        self._temperature = settings.TEMPERATURE

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
    )
    async def create_message(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Send a message to Claude and get a response.

        Args:
            messages: List of message dicts with 'role' and 'content'.
            system: Optional system prompt.
            model: Override the default model.
            max_tokens: Override the default max tokens.
            temperature: Override the default temperature.
            tools: Optional list of tool definitions for function calling.

        Returns:
            Response dict with 'content', 'model', 'usage', etc.
        """
        kwargs: dict[str, Any] = {
            "model": model or self._model,
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

        response = await self._client.messages.create(**kwargs)

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
                f"\n\nYou must respond with valid JSON matching this schema:\n"
                f"{json.dumps(output_schema, indent=2)}"
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
