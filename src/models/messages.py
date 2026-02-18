"""Data models for messages and conversations."""

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    """Return timezone-aware UTC now."""
    return datetime.now(UTC)


class Message(BaseModel):
    """A single message in a conversation."""

    role: str  # user, assistant, system
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)


class ConversationContext(BaseModel):
    """Context for an ongoing conversation."""

    conversation_id: str
    user_id: str
    messages: list[Message] = Field(default_factory=list)
    intent: str | None = None
    entities: dict[str, Any] = Field(default_factory=dict)
    sentiment_score: float = 0.0
    resolution_attempts: int = 0
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouterResult(BaseModel):
    """Result from the Router Agent's intent classification."""

    intent: str
    entities: dict[str, str | None] = Field(default_factory=dict)
    confidence: float
    clarifying_question: str | None = None
    suggested_agent: str


class AgentAction(BaseModel):
    """An action taken by an agent."""

    agent: str
    action: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    details: dict[str, Any] = Field(default_factory=dict)
    response: dict[str, Any] | None = None
    requires_followup: bool = False


class SupportTicket(BaseModel):
    """A support ticket for human escalation."""

    id: str
    user_id: str
    conversation_id: str
    reason: str
    priority: str = "normal"  # low, normal, high, urgent
    context: dict[str, Any] = Field(default_factory=dict)
    status: str = "open"  # open, assigned, resolved, closed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CampaignMessage(BaseModel):
    """A message to be sent as part of an outreach campaign."""

    campaign_id: str
    campaign_type: str
    target_user_id: str
    channel: str  # whatsapp, email, push
    template: str
    personalized_content: str | None = None
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    status: str = "pending"  # pending, sent, delivered, failed


class Document(BaseModel):
    """A document retrieved from RAG pipeline."""

    id: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float = 0.0
    namespace: str = ""
