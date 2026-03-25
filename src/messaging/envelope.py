"""Versioned event envelope for RabbitMQ payloads."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator

CURRENT_EVENT_VERSION: int = 1


class EventEnvelope(BaseModel):
    """Wire format for all domain events."""

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_name: str = Field(..., min_length=1, max_length=200)
    event_version: int = Field(default=CURRENT_EVENT_VERSION, ge=1)
    occurred_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    )
    idempotency_key: str | None = Field(default=None, max_length=500)
    source: str = Field(default="groupio-api", max_length=100)
    entity_type: str | None = Field(default=None, max_length=100)
    entity_id: str | None = Field(default=None, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str | None = Field(default=None, max_length=128)
    traceparent: str | None = Field(default=None, max_length=256)

    @field_validator("payload", mode="before")
    @classmethod
    def _payload_dict(cls, v: Any) -> dict[str, Any]:
        if v is None:
            return {}
        if isinstance(v, dict):
            return v
        raise TypeError("payload must be a dict")

    def to_json_dict(self) -> dict[str, Any]:
        """JSON-serialisable dict (for message body)."""
        return self.model_dump(mode="json")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EventEnvelope:
        return cls.model_validate(data)
