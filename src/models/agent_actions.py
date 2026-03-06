"""Typed action payload contracts for agent-to-orchestrator handoff."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AgentActionEnvelope(BaseModel):
    """Minimal normalized contract for `state["actions_taken"]` entries."""

    model_config = ConfigDict(extra="allow")

    agent: str
    action: str
    response: dict[str, Any] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)
    requires_followup: bool = False
    summary_for_next_agent: str = ""
    suggested_next_intent: str = ""
    suggested_next_agent: str = ""
    entities_to_pass: dict[str, Any] = Field(default_factory=dict)


def normalize_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize actions to a stable envelope with safe defaults."""
    normalized: list[dict[str, Any]] = []
    for raw in actions:
        model = AgentActionEnvelope.model_validate(raw)
        # Keep unknown fields while ensuring envelope defaults are always present.
        merged = dict(raw)
        merged.update(model.model_dump())
        normalized.append(merged)
    return normalized
