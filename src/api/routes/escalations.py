"""Escalation API routes."""

import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.api.middleware.auth import get_current_user
from src.databases.postgres import get_postgres_client
from src.models.escalation import (
    EscalationCreate,
    EscalationFilterRequest,
    EscalationListResponse,
    EscalationPriority,
    EscalationReplyRequest,
    EscalationResponse,
    EscalationSource,
    EscalationStats,
    EscalationStatus,
    EscalationUpdate,
)
from src.models.user import UserInDB, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(tags=["escalations"])


class ResolveEscalationBody(BaseModel):
    """Request body for resolving an escalation."""

    resolution_notes: Optional[str] = Field(None, max_length=2000)


@router.post("/", response_model=EscalationResponse)
async def create_escalation(
    request: EscalationCreate,
) -> EscalationResponse:
    """Create a new escalation (typically called by agents)."""
    db = get_postgres_client()

    escalation_id = str(uuid4())
    escalation_data = request.model_dump()
    escalation_data["id"] = escalation_id
    escalation_data["status"] = EscalationStatus.OPEN

    escalation = await db.create_escalation(escalation_data)

    logger.info(
        "Escalation created: %s from %s with priority %s",
        escalation_id,
        request.source_agent,
        request.priority,
    )

    return escalation


@router.get("/", response_model=EscalationListResponse)
async def list_escalations(
    status: Optional[EscalationStatus] = None,
    priority: Optional[EscalationPriority] = None,
    source_agent: Optional[EscalationSource] = None,
    assigned_to: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationListResponse:
    """List escalations (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    filters = {}
    if status:
        filters["status"] = status.value
    if priority:
        filters["priority"] = priority.value
    if source_agent:
        filters["source_agent"] = source_agent.value
    if assigned_to:
        filters["assigned_to"] = assigned_to

    escalations, total = await db.list_escalations(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return EscalationListResponse(
        items=escalations,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.post("/filter", response_model=EscalationListResponse)
async def filter_escalations(
    request: EscalationFilterRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationListResponse:
    """Filter escalations with advanced criteria (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    filters = {}
    if request.status:
        filters["status"] = [s.value for s in request.status]
    if request.priority:
        filters["priority"] = [p.value for p in request.priority]
    if request.source_agent:
        filters["source_agent"] = [s.value for s in request.source_agent]
    if request.reason:
        filters["reason"] = [r.value for r in request.reason]
    if request.assigned_to:
        filters["assigned_to"] = request.assigned_to
    if request.date_from:
        filters["date_from"] = request.date_from
    if request.date_to:
        filters["date_to"] = request.date_to

    escalations, total = await db.list_escalations(
        filters=filters,
        page=request.page,
        page_size=request.page_size,
    )

    return EscalationListResponse(
        items=escalations,
        total=total,
        page=request.page,
        page_size=request.page_size,
        has_more=(request.page * request.page_size) < total,
    )


@router.get("/stats", response_model=EscalationStats)
async def get_escalation_stats(
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationStats:
    """Get escalation statistics (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()
    stats = await db.get_escalation_stats()
    return stats


@router.get("/my")
async def get_my_escalations(
    status: Optional[EscalationStatus] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationListResponse:
    """Get escalations assigned to current admin."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    filters = {"assigned_to": current_user.id}
    if status:
        filters["status"] = status.value

    escalations, total = await db.list_escalations(
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return EscalationListResponse(
        items=escalations,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/{escalation_id}", response_model=EscalationResponse)
async def get_escalation(
    escalation_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Get escalation by ID (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()
    escalation = await db.get_escalation(escalation_id)

    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    return escalation


@router.put("/{escalation_id}", response_model=EscalationResponse)
async def update_escalation(
    escalation_id: str,
    request: EscalationUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Update an escalation (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    update_data = request.model_dump(exclude_unset=True)

    # Track resolution time
    if (
        request.status == EscalationStatus.RESOLVED
        and escalation.status != EscalationStatus.RESOLVED
    ):
        update_data["resolved_at"] = datetime.utcnow()

    updated = await db.update_escalation(escalation_id, update_data)

    logger.info("Escalation %s updated by %s", escalation_id, current_user.id)

    return updated


@router.post("/{escalation_id}/assign")
async def assign_escalation(
    escalation_id: str,
    admin_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Assign escalation to an admin."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    # Verify admin exists
    admin = await db.get_user(admin_id)
    if not admin or admin.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=400, detail="Invalid admin ID")

    updated = await db.update_escalation(
        escalation_id,
        {
            "assigned_to": admin_id,
            "status": EscalationStatus.IN_PROGRESS,
        },
    )

    logger.info("Escalation %s assigned to %s", escalation_id, admin_id)

    return updated


@router.post("/{escalation_id}/reply")
async def reply_to_escalation(
    escalation_id: str,
    request: EscalationReplyRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Reply to an escalation (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    # Add message
    message_id = str(uuid4())
    await db.add_escalation_message(
        escalation_id=escalation_id,
        message_id=message_id,
        sender_type="admin",
        sender_id=current_user.id,
        content=request.content,
    )

    # Update status if resolving
    update_data = {}
    if request.resolve:
        update_data["status"] = EscalationStatus.RESOLVED
        update_data["resolved_at"] = datetime.utcnow()
        if request.resolution_notes:
            update_data["resolution_notes"] = request.resolution_notes

    if update_data:
        await db.update_escalation(escalation_id, update_data)

    # Fetch updated escalation
    updated = await db.get_escalation(escalation_id)
    return updated


@router.post("/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    resolution_notes: Optional[str] = Query(None, description="Legacy: use body instead"),
    body: Optional[ResolveEscalationBody] = Body(None),
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Resolve an escalation (admin only). Prefer body.resolution_notes for longer text."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    if escalation.status == EscalationStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Escalation already resolved")

    notes = (body and body.resolution_notes) or resolution_notes
    update_data = {
        "status": EscalationStatus.RESOLVED,
        "resolved_at": datetime.utcnow(),
    }
    if notes:
        update_data["resolution_notes"] = notes

    updated = await db.update_escalation(escalation_id, update_data)

    logger.info("Escalation %s resolved by %s", escalation_id, current_user.id)

    return updated


@router.post("/{escalation_id}/reopen")
async def reopen_escalation(
    escalation_id: str,
    reason: str,
    current_user: UserInDB = Depends(get_current_user),
) -> EscalationResponse:
    """Reopen a resolved escalation (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    if escalation.status != EscalationStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Can only reopen resolved escalations")

    # Add message about reopening
    message_id = str(uuid4())
    await db.add_escalation_message(
        escalation_id=escalation_id,
        message_id=message_id,
        sender_type="admin",
        sender_id=current_user.id,
        content=f"Escalation reopened: {reason}",
    )

    updated = await db.update_escalation(
        escalation_id,
        {
            "status": EscalationStatus.OPEN,
            "resolved_at": None,
        },
    )

    logger.info("Escalation %s reopened by %s: %s", escalation_id, current_user.id, reason)

    return updated


@router.get("/{escalation_id}/messages")
async def get_escalation_messages(
    escalation_id: str,
    current_user: UserInDB = Depends(get_current_user),
) -> dict:
    """Get all messages for an escalation (admin only)."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    db = get_postgres_client()

    escalation = await db.get_escalation(escalation_id)
    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    messages = await db.get_escalation_messages(escalation_id)

    return {"escalation_id": escalation_id, "messages": messages}
