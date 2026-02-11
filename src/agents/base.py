"""Base agent class for all Groupio agents."""

import logging
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field

from src.models.agent_state import AgentState
from src.rag.pipeline import get_rag_pipeline
from src.utils.llm_client import get_llm_client
from src.utils.monitoring import track_agent_execution

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

    def _build_system_prompt(self, state: AgentState) -> str:
        """Build the system prompt with state context."""
        return self.config.system_prompt.format(
            user_profile=state.get("user_profile", {}),
            building_context=state.get("building_context", {}),
            active_offers=state.get("active_offers", []),
            rag_context=state.get("rag_results", []),
            conversation_history=state.get("messages", []),
        )

    async def reload_config(self) -> None:
        """Reload agent configuration (for hot-reloading prompts)."""
        logger.info("Reloading config for agent: %s", self.config.name)

    async def get_metrics(self) -> dict[str, Any]:
        """Get agent execution metrics."""
        return {
            "name": self.config.name,
            **self._metrics,
        }
