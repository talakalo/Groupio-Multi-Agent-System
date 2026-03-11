"""State contract validation utilities for LangGraph agent state."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.models.agent_actions import normalize_actions
from src.models.agent_state import AgentState


class AgentStateContract(BaseModel):
    """Runtime validation contract for orchestrator state boundaries."""

    model_config = ConfigDict(extra="allow")

    state_contract_version: int = Field(default=1, ge=1)

    # Core identifiers
    user_id: str
    building_id: str | None = None
    conversation_id: str

    # Messages
    messages: list[dict[str, Any]]

    # Routing
    current_agent: Literal[
        "router",
        "matching",
        "pricing",
        "vetting",
        "support",
        "outreach",
        "analytics",
        "architecture",
        "payment",
        "notification",
        "influencer",
        "human",
    ]
    intent: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)

    # Context
    user_profile: dict[str, Any]
    building_context: dict[str, Any]
    active_offers: list[dict[str, Any]]

    # Entities / handoff
    entities: dict[str, Any] | None = None
    last_agent_handoff: dict[str, Any] | None = None
    context_for_next_agent: dict[str, Any] | None = None

    # RAG and actions
    rag_results: list[dict[str, Any]]
    actions_taken: list[dict[str, Any]]

    # Handoff / response
    needs_human: bool
    escalation_reason: str | None = None
    final_response: dict[str, Any] | None = None

    # Metadata
    start_time: str
    tokens_used: int = Field(ge=0)


def validate_agent_state(state: dict[str, Any], *, context: str = "unknown") -> AgentState:
    """Validate state at orchestrator boundaries and return normalized state."""
    try:
        validated = AgentStateContract.model_validate(state)
    except ValidationError as exc:
        raise ValueError(f"Invalid agent state at {context}: {exc}") from exc

    # Ensure start_time is parseable ISO datetime
    try:
        datetime.fromisoformat(validated.start_time)
    except ValueError as exc:
        raise ValueError(f"Invalid agent state at {context}: start_time must be ISO format") from exc

    # Keep unknown keys (if any) while ensuring validated core schema
    normalized = dict(state)
    normalized.update(validated.model_dump())
    try:
        normalized["actions_taken"] = normalize_actions(normalized.get("actions_taken", []))
    except ValidationError as exc:
        raise ValueError(f"Invalid agent state at {context}: {exc}") from exc
    return normalized  # type: ignore[return-value]
