"""Escalation Pydantic models."""

import json
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator


class EscalationPriority(StrEnum):
    """Escalation priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EscalationStatus(StrEnum):
    """Escalation status enum."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_CUSTOMER = "waiting_customer"
    RESOLVED = "resolved"
    CLOSED = "closed"


class EscalationSource(StrEnum):
    """Source agent that triggered escalation."""

    ROUTER = "router"
    ORCHESTRATOR = "orchestrator"
    MATCHING = "matching"
    PRICING = "pricing"
    PAYMENT = "payment"
    VETTING = "vetting"
    SUPPORT = "support"
    OUTREACH = "outreach"
    ANALYTICS = "analytics"
    SYSTEM = "system"


class EscalationReason(StrEnum):
    """Reason for escalation."""

    LOW_CONFIDENCE = "low_confidence"
    NEGATIVE_SENTIMENT = "negative_sentiment"
    LEGAL_MENTION = "legal_mention"
    REPEATED_ATTEMPTS = "repeated_attempts"
    COMPLEX_REQUEST = "complex_request"
    FRAUD_SUSPECTED = "fraud_suspected"
    COMPLAINT = "complaint"
    TECHNICAL_ERROR = "technical_error"
    OTHER = "other"
    # Seed / admin tooling (scripts/seed_test_data.py)
    MANUAL_REVIEW = "manual_review"
    PAYMENT_FAILURE = "payment_failure"
    USER_COMPLAINT = "user_complaint"
    QUALITY_ISSUE = "quality_issue"
    DEADLINE_RISK = "deadline_risk"


def _coerce_db_escalation_source(v: Any) -> Any:
    if v is None:
        return EscalationSource.SYSTEM.value
    s = str(v).strip().lower()
    try:
        return EscalationSource(s).value
    except ValueError:
        return EscalationSource.SYSTEM.value


def _coerce_db_escalation_reason(v: Any) -> Any:
    if v is None:
        return EscalationReason.OTHER.value
    s = str(v).strip().lower()
    try:
        return EscalationReason(s).value
    except ValueError:
        return EscalationReason.OTHER.value


def _coerce_db_escalation_status(v: Any) -> Any:
    if v is None:
        return EscalationStatus.OPEN.value
    s = str(v).strip().lower()
    try:
        return EscalationStatus(s).value
    except ValueError:
        return EscalationStatus.OPEN.value


def _coerce_db_escalation_priority(v: Any) -> Any:
    if v is None:
        return EscalationPriority.MEDIUM.value
    s = str(v).strip().lower()
    if s == "urgent":
        return EscalationPriority.CRITICAL.value
    try:
        return EscalationPriority(s).value
    except ValueError:
        return EscalationPriority.MEDIUM.value


EscalationSourceDB = Annotated[EscalationSource, BeforeValidator(_coerce_db_escalation_source)]
EscalationReasonDB = Annotated[EscalationReason, BeforeValidator(_coerce_db_escalation_reason)]
EscalationStatusDB = Annotated[EscalationStatus, BeforeValidator(_coerce_db_escalation_status)]
EscalationPriorityDB = Annotated[EscalationPriority, BeforeValidator(_coerce_db_escalation_priority)]


class EscalationBase(BaseModel):
    """Base escalation model."""

    user_id: str
    conversation_id: str
    source_agent: EscalationSource
    reason: EscalationReason
    priority: EscalationPriority = EscalationPriority.MEDIUM
    summary: str = Field(..., min_length=10, max_length=1000)


class EscalationCreate(EscalationBase):
    """Create escalation request."""

    context: dict[str, Any] = {}
    agent_reasoning: str | None = None


class EscalationUpdate(BaseModel):
    """Update escalation request."""

    status: EscalationStatus | None = None
    priority: EscalationPriority | None = None
    assigned_to: str | None = None
    resolution_notes: str | None = Field(None, max_length=2000)


class EscalationMessage(BaseModel):
    """Message in escalation conversation."""

    id: str
    escalation_id: str
    sender_type: str  # "user", "agent", "admin"
    sender_id: str
    content: str
    created_at: datetime


class EscalationInDB(EscalationBase):
    """Escalation stored in database."""

    model_config = ConfigDict(from_attributes=True)

    # Relaxed / coerced vs EscalationBase: legacy rows and drivers may violate create-time rules.
    source_agent: EscalationSourceDB
    reason: EscalationReasonDB
    priority: EscalationPriorityDB = EscalationPriority.MEDIUM
    summary: str = Field(..., min_length=1, max_length=2000)

    id: str
    status: EscalationStatusDB = EscalationStatus.OPEN
    assigned_to: str | None = None
    context: dict[str, Any] = {}
    agent_reasoning: str | None = None

    @field_validator("context", mode="before")
    @classmethod
    def coerce_context_dict(cls, v: Any) -> dict[str, Any]:
        """DB drivers may return JSON/JSONB as str; API expects a dict."""
        if v is None:
            return {}
        if isinstance(v, dict):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return {}
            try:
                parsed = json.loads(s)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    resolution_notes: str | None = None
    messages: list[EscalationMessage] = []
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class EscalationResponse(EscalationInDB):
    """Escalation response model."""

    user_name: str | None = None
    user_email: str | None = None
    assigned_to_name: str | None = None


class EscalationListResponse(BaseModel):
    """Paginated escalation list response."""

    items: list[EscalationResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class EscalationFilterRequest(BaseModel):
    """Escalation filter request."""

    status: list[EscalationStatus] | None = None
    priority: list[EscalationPriority] | None = None
    source_agent: list[EscalationSource] | None = None
    reason: list[EscalationReason] | None = None
    assigned_to: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class EscalationStats(BaseModel):
    """Escalation statistics."""

    total_open: int = 0
    total_in_progress: int = 0
    total_resolved_today: int = 0
    average_resolution_time_hours: float = 0
    by_priority: dict[str, int] = {}
    by_source: dict[str, int] = {}
    by_reason: dict[str, int] = {}


class EscalationReplyRequest(BaseModel):
    """Reply to escalation request."""

    content: str = Field(..., min_length=1, max_length=2000)
    resolve: bool = False
    resolution_notes: str | None = None
