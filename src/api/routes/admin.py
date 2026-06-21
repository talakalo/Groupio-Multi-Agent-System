"""Admin API routes for system management."""

import csv
import io
import json
import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, model_validator

from src.api.middleware.auth import hash_password, require_admin_only
from src.databases.postgres import get_postgres_client
from src.databases.pg_store import get_pg_store
from src.databases.vector_store import get_vector_store
from src.models.contractor import ContractorMembershipAdminUpdate
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
from src.rag.pipeline import get_rag_pipeline
from src.services.email import get_email_service

logger = logging.getLogger(__name__)

# --------------- Pydantic request models ---------------


_VALID_USER_ROLES = {"resident", "contractor", "admin", "buildings_manager", "super_admin"}
# Roles that can be assigned by a regular admin (not super_admin)
_ADMIN_ASSIGNABLE_ROLES = {"resident", "contractor", "admin", "buildings_manager"}


class AdminUserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _validate_role(self) -> "AdminUserUpdate":
        if self.role is not None and self.role not in _VALID_USER_ROLES:
            raise ValueError(f"Invalid role '{self.role}'. Valid roles: {sorted(_VALID_USER_ROLES)}")
        return self


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    role: str = "admin"

    @model_validator(mode="after")
    def _validate_role(self) -> "AdminUserCreate":
        if self.role not in _VALID_USER_ROLES:
            raise ValueError(f"Invalid role '{self.role}'. Valid roles: {sorted(_VALID_USER_ROLES)}")
        return self


class ForceCancelRequest(BaseModel):
    reason: str = ""


class PaymentStatusOverride(BaseModel):
    status: str
    reason: str = ""


_ALLOWED_PAYMENT_STATUSES = {"pending", "completed", "failed", "refunded", "on_hold"}


router = APIRouter(
    tags=["admin"],
    # P0 SECURITY: platform-admin access is restricted to admin and super_admin only.
    # buildings_manager is NOT a platform admin — it manages a single building and
    # must never access platform-wide admin APIs (user management, system settings,
    # agent controls, payment overrides, exports, etc.).
    # Use get_buildings_manager_user on building-scoped routes instead.
    dependencies=[Depends(require_admin_only)],
)


@router.get("/status")
async def system_status() -> dict[str, Any]:
    """Get detailed system status including all services."""
    orchestrator = get_orchestrator()

    agent_status = {}
    for name, agent in orchestrator.agents.items():
        metrics = await agent.get_metrics()
        agent_status[name] = {
            "model": agent.config.model,
            "calls": metrics.get("calls", 0),
            "errors": metrics.get("errors", 0),
        }

    vector_status = {}
    vs = get_vector_store()
    for collection in ["contractors", "buildings", "knowledge_base", "conversations"]:
        try:
            info = await vs.get_collection_info(collection)
            vector_status[collection] = info
        except Exception:
            vector_status[collection] = {"status": "unavailable"}

    return {
        "agents": agent_status,
        "vector_collections": vector_status,
    }


@router.post("/agents/{agent_name}/reload")
async def reload_agent(agent_name: str) -> dict[str, str]:
    """Reload an agent's configuration."""
    orchestrator = get_orchestrator()
    agent = orchestrator.agents.get(agent_name)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found",
        )
    await agent.reload_config()
    return {"status": "reloaded", "agent": agent_name}


@router.get("/metrics")
async def get_metrics() -> dict[str, Any]:
    """Get system metrics."""
    orchestrator = get_orchestrator()

    agent_metrics = {}
    for name, agent in orchestrator.agents.items():
        agent_metrics[name] = await agent.get_metrics()

    rag_metrics = {}
    try:
        rag = get_rag_pipeline()
        rag_metrics = await rag.get_metrics()
    except Exception:
        pass

    return {
        "agents": agent_metrics,
        "rag": rag_metrics,
    }


@router.get("/collections")
async def list_collections() -> dict[str, Any]:
    """List all vector DB collections with stats."""
    vs = get_vector_store()
    collections = {}
    for name in ["contractors", "buildings", "knowledge_base", "conversations"]:
        try:
            collections[name] = await vs.get_collection_info(name)
        except Exception:
            collections[name] = {"status": "unavailable"}
    return {"collections": collections}


@router.get("/analytics")
async def get_analytics() -> dict[str, Any]:
    """Dashboard analytics (admin). Aggregates real data from DB when available."""
    db = get_postgres_client()

    open_tickets = 0
    resolved_today = 0
    active_offers = 0
    gmv_today = 0
    total_contractors = 0

    # --- Escalation stats ---
    try:
        stats = await db.get_escalation_stats()
        by_status = stats.get("by_status") or {}
        open_tickets = sum(c for s, c in by_status.items() if str(s).lower() not in ("resolved", "closed"))
        resolved_today = by_status.get("resolved", 0)
    except Exception:
        logger.debug("Could not fetch escalation stats for analytics")

    # --- Offer stats (active count + GMV) ---
    try:
        offers, total_offers = await db.get_all_offers_admin(page=1, page_size=1, status="active")
        active_offers = total_offers
    except Exception:
        pass

    try:
        # Sum the price of today's completed offers for GMV
        from datetime import date

        today_str = date.today().isoformat()
        completed_offers, _ = await db.get_all_offers_admin(page=1, page_size=1000, status="completed")
        gmv_today = sum(
            float(o.get("price") or o.get("total_price") or 0)
            for o in completed_offers
            if str(o.get("completed_at", "") or o.get("updated_at", "")).startswith(today_str)
        )
    except Exception:
        pass

    # --- Contractor count ---
    try:
        _, total_contractors = await db.list_contractors(filters={}, page=1, page_size=1)
    except Exception:
        logger.debug("Could not fetch contractor count for analytics")

    return {
        "gmvToday": gmv_today,
        "gmvChange": 0,
        "activeOffers": active_offers,
        "activeOffersChange": 0,
        "openTickets": open_tickets,
        "openTicketsChange": 0,
        "resolvedToday": resolved_today,
        "totalContractors": total_contractors,
    }


# --------------- User management ---------------


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: str | None = None,
    is_active: bool | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List users with pagination and optional filters."""
    db = get_postgres_client()
    items, total = await db.get_admin_users(page=page, page_size=page_size, role=role, is_active=is_active)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Get a single user by ID."""
    db = get_postgres_client()
    user = await db.get_user_profile(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    body: AdminUserUpdate,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Update user role / is_active status."""
    db = get_postgres_client()
    update_data: dict[str, Any] = {}
    if body.role is not None:
        # Only super_admin can assign the super_admin role (privilege escalation guard)
        if body.role == "super_admin" and admin.role not in ("super_admin",):
            raise HTTPException(
                status_code=403,
                detail="Only super_admin can assign the super_admin role.",
            )
        update_data["role"] = body.role
    if body.is_active is not None:
        update_data["is_active"] = body.is_active
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Allow role updates by extending the allowed set in update_user
    user = await db.update_user(user_id, update_data)
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "update_user",
            "resource_type": "user",
            "resource_id": user_id,
            "details": update_data,
            "ip_address": request.client.host if request.client else None,
        }
    )
    return {"id": user.id, "role": user.role, "is_active": user.is_active}


@router.post("/users")
async def create_admin_user(
    body: AdminUserCreate,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Create a new admin / staff user."""
    # Only super_admin can create super_admin users (privilege escalation guard)
    if body.role == "super_admin" and admin.role not in ("super_admin",):
        raise HTTPException(
            status_code=403,
            detail="Only super_admin can create super_admin users.",
        )
    db = get_postgres_client()
    user_id = str(uuid4())
    hashed = hash_password(body.password)
    user_data = {
        "id": user_id,
        "email": body.email,
        "hashed_password": hashed,
        "full_name": body.name,
        "phone": body.phone,
        "role": body.role,
        "is_active": True,
        "is_verified": True,
    }
    user = await db.create_user(user_data)
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "create_user",
            "resource_type": "user",
            "resource_id": user_id,
            "details": {"role": body.role, "email": body.email},
            "ip_address": request.client.host if request.client else None,
        }
    )
    return {"id": user.id, "email": user.email, "role": user.role}


# --------------- Offer management ---------------


@router.get("/offers")
async def list_offers_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    category: str | None = None,
    flagged: bool | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List all offers (admin view) with pagination and filters."""
    db = get_postgres_client()
    items, total = await db.get_all_offers_admin(
        page=page, page_size=page_size, status=status, category=category, flagged=flagged
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/offers/{offer_id}/flag")
async def flag_offer(
    offer_id: str,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Flag an offer for review."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    updated = await db.update_offer(offer_id, {"status": "flagged"})
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "flag_offer",
            "resource_type": "offer",
            "resource_id": offer_id,
            "ip_address": request.client.host if request.client else None,
        }
    )
    return updated


@router.post("/offers/{offer_id}/approve")
async def approve_offer(
    offer_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Approve a flagged offer."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    updated = await db.update_offer(offer_id, {"status": "active"})
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "approve_offer",
            "resource_type": "offer",
            "resource_id": offer_id,
            "ip_address": request.client.host if request.client else None,
        }
    )
    # Notify the offer creator
    try:
        creator_id = offer.get("created_by")
        if creator_id:
            creator = await db.get_user_profile(creator_id)
            if creator and creator.get("email"):
                background_tasks.add_task(
                    get_email_service().send_offer_approved,
                    to_email=creator["email"],
                    user_name=creator.get("full_name", "דייר"),
                    offer_title=offer.get("title", ""),
                    offer_id=offer_id,
                )
    except Exception:
        logger.warning("Failed to send approval notification for offer=%s", offer_id)
    return updated


@router.post("/offers/{offer_id}/cancel")
async def cancel_offer(
    offer_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Cancel an offer."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    # Fetch participants before status change so we can notify them
    try:
        participants = await db.get_offer_participants(offer_id)
    except Exception:
        participants = []
    updated = await db.update_offer(offer_id, {"status": "cancelled"})
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "cancel_offer",
            "resource_type": "offer",
            "resource_id": offer_id,
            "ip_address": request.client.host if request.client else None,
        }
    )
    # Notify all participants of admin-initiated cancellation
    offer_title = offer.get("title", "")
    email_svc = get_email_service()
    for p in participants:
        p_email = p.get("email") or p.get("user_email", "")
        if p_email:
            background_tasks.add_task(
                email_svc.send_offer_cancelled,
                to_email=p_email,
                user_name=p.get("full_name") or p.get("user_name", "דייר"),
                offer_title=offer_title,
                reason="ההצעה בוטלה על ידי מנהל המערכת",
            )
    return updated


# --------------- System settings ---------------


@router.get("/settings")
async def get_settings(
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Get all system settings as key-value pairs."""
    db = get_postgres_client()
    rows = await db.get_system_settings()
    return {row["key"]: row["value"] for row in rows}


@router.put("/settings")
async def update_settings(
    body: dict[str, Any],
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Update system settings (body: dict of key-value pairs)."""
    db = get_postgres_client()
    for key, value in body.items():
        await db.upsert_system_setting(key=key, value=value, updated_by=admin.id)
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "update_settings",
            "resource_type": "system_settings",
            "details": {"keys": list(body.keys())},
            "ip_address": request.client.host if request.client else None,
        }
    )
    # Return the refreshed settings
    rows = await db.get_system_settings()
    return {row["key"]: row["value"] for row in rows}


# --------------- Audit logs ---------------


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: str | None = None,
    resource_type: str | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List audit logs with pagination and optional filters."""
    db = get_postgres_client()
    items, total = await db.list_audit_logs(page=page, page_size=page_size, action=action, resource_type=resource_type)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# --------------- Data export ---------------


@router.get("/export/offers")
async def export_offers_csv(
    status: str | None = None,
    category: str | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> StreamingResponse:
    """Export all offers to CSV. Supports optional status/category filters."""
    db = get_postgres_client()
    items, _ = await db.get_all_offers_admin(
        page=1,
        page_size=10000,
        status=status,
        category=category,
    )

    fieldnames = [
        "id",
        "title",
        "category",
        "status",
        "building_id",
        "base_price",
        "current_participants",
        "min_participants",
        "max_participants",
        "matched_contractor_id",
        "created_by",
        "created_at",
        "deadline",
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for offer in items:
        writer.writerow({k: offer.get(k, "") for k in fieldnames})

    output.seek(0)
    filename = f"groupio_offers_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/participants")
async def export_participants_csv(
    offer_id: str | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> StreamingResponse:
    """Export offer participants to CSV. Filter by offer_id if provided."""
    db = get_postgres_client()

    rows: list[dict] = []
    if offer_id:
        offer = await db.get_offer(offer_id)
        offer_title = offer.get("title", "") if offer else ""
        try:
            participants = await db.get_offer_participants(offer_id)
            for p in participants:
                rows.append(
                    {
                        "offer_id": offer_id,
                        "offer_title": offer_title,
                        "user_id": p.get("user_id", ""),
                        "user_name": p.get("full_name") or p.get("user_name", ""),
                        "user_email": p.get("email") or p.get("user_email", ""),
                        "unit_number": p.get("unit_number", ""),
                        "unit_count": p.get("unit_count", 1),
                        "joined_at": p.get("joined_at", ""),
                    }
                )
        except Exception:
            logger.warning("Failed to fetch participants for offer=%s in CSV export", offer_id)
    else:
        # Export participants for all offers
        offers, _ = await db.get_all_offers_admin(page=1, page_size=10000)
        for offer in offers:
            oid = offer.get("id", "")
            offer_title = offer.get("title", "")
            try:
                participants = await db.get_offer_participants(oid)
                for p in participants:
                    rows.append(
                        {
                            "offer_id": oid,
                            "offer_title": offer_title,
                            "user_id": p.get("user_id", ""),
                            "user_name": p.get("full_name") or p.get("user_name", ""),
                            "user_email": p.get("email") or p.get("user_email", ""),
                            "unit_number": p.get("unit_number", ""),
                            "unit_count": p.get("unit_count", 1),
                            "joined_at": p.get("joined_at", ""),
                        }
                    )
            except Exception:
                logger.warning("Failed to fetch participants for offer=%s in CSV export", oid)

    fieldnames = [
        "offer_id",
        "offer_title",
        "user_id",
        "user_name",
        "user_email",
        "unit_number",
        "unit_count",
        "joined_at",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    output.seek(0)
    filename = f"groupio_participants_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/payments")
async def export_payments_csv(
    admin: UserInDB = Depends(require_admin_only),
) -> StreamingResponse:
    """Export all payment records to CSV."""
    db = get_postgres_client()

    try:
        payments = await db.execute_query(
            "SELECT id, user_id, offer_id, invoice_id, amount, currency, "
            "status, payment_method_id, transaction_id, created_at FROM payments "
            "ORDER BY created_at DESC"
        )
        payments = payments or []
    except Exception:
        logger.warning("execute_query not available for payments export; returning empty CSV")
        payments = []

    fieldnames = [
        "id",
        "user_id",
        "offer_id",
        "invoice_id",
        "amount",
        "currency",
        "status",
        "payment_method_id",
        "transaction_id",
        "created_at",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for p in payments:
        writer.writerow({k: p.get(k, "") for k in fieldnames})

    output.seek(0)
    filename = f"groupio_payments_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --------------- Vetting pipeline monitoring ---------------


@router.get("/vetting/status")
async def vetting_pipeline_status(
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Return current vetting pipeline stats: counts by decision bucket and contractors needing review."""
    db = get_postgres_client()

    # Contractors pending vetting (submitted but not yet verified/rejected)
    try:
        pending_items, pending_total = await db.list_contractors(
            filters={"verification_status": "pending"}, page=1, page_size=100
        )
    except Exception:
        pending_items, pending_total = [], 0

    # Contractors that have been through vetting and were approved
    try:
        _, approved_total = await db.list_contractors(filters={"verification_status": "verified"}, page=1, page_size=1)
    except Exception:
        approved_total = 0

    # Contractors that were rejected
    try:
        _, rejected_total = await db.list_contractors(filters={"verification_status": "rejected"}, page=1, page_size=1)
    except Exception:
        rejected_total = 0

    # Build a brief summary list for the pending contractors
    pending_summary = [
        {
            "id": c.get("id"),
            "businessName": c.get("business_name") or c.get("businessName", ""),
            "submittedAt": c.get("created_at") or c.get("createdAt", ""),
            "trustScore": c.get("trust_score"),
        }
        for c in (pending_items or [])
    ]

    return {
        "pendingReview": pending_total,
        "approved": approved_total,
        "rejected": rejected_total,
        "pendingContractors": pending_summary,
    }


# --------------- Offer management ---------------


@router.post("/offers/{offer_id}/force-cancel")
async def force_cancel_offer(
    offer_id: str,
    body: ForceCancelRequest,
    background_tasks: BackgroundTasks,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Force-cancel an offer in any non-terminal status and notify all participants."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    terminal_statuses = {"cancelled", "completed"}
    if offer.get("status") in terminal_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Offer is already in terminal status: {offer.get('status')}",
        )

    await db.update_offer(offer_id, {"status": "cancelled"})
    logger.info("Admin %s force-cancelled offer %s (reason: %s)", admin.id, offer_id, body.reason)

    # Notify all participants of the cancellation
    try:
        participants = await db.get_offer_participants(offer_id)
        for p in participants:
            p_email = p.get("email") or (p.get("users") or {}).get("email")
            p_name = p.get("full_name") or (p.get("users") or {}).get("full_name") or "דייר"
            if p_email:
                background_tasks.add_task(
                    get_email_service().send_offer_cancelled,
                    to_email=p_email,
                    user_name=p_name,
                    offer_title=offer.get("title", ""),
                    reason=body.reason or None,
                )
    except Exception:
        logger.warning("Failed to notify participants of force-cancel for offer %s", offer_id)

    return {"status": "cancelled", "offer_id": offer_id}


# --------------- Payment management ---------------


@router.patch("/payments/{payment_id}/status")
async def override_payment_status(
    payment_id: str,
    body: PaymentStatusOverride,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Manually override a payment record's status (admin only)."""
    if body.status not in _ALLOWED_PAYMENT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{body.status}'. Allowed: {', '.join(sorted(_ALLOWED_PAYMENT_STATUSES))}",
        )

    db = get_postgres_client()
    payment = await db.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    await db.update_payment(payment_id, {"status": body.status})
    logger.info(
        "Admin %s overrode payment %s status: %s → %s (reason: %s)",
        admin.id,
        payment_id,
        payment.get("status"),
        body.status,
        body.reason,
    )
    return {"payment_id": payment_id, "status": body.status, "updated_by": admin.id}


# --------------- Outreach queue management ---------------


@router.get("/outreach/queue")
async def list_outreach_queue(
    status: str = "pending_approval",
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List pending outreach messages awaiting admin approval."""
    db = get_postgres_client()
    items = await db.list_outreach_queue(status=status)
    return {"items": items, "total": len(items), "status": status}


@router.post("/outreach/{pending_id}/approve")
async def approve_outreach(
    pending_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Approve and dispatch a pending outreach message."""
    db = get_postgres_client()
    entry = await db.get_outreach_pending(pending_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Outreach entry not found")
    if entry.get("status") != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve entry with status '{entry.get('status')}'",
        )
    await db.update_outreach_queue_status(pending_id, "approved", approved_by=admin.id)
    # Mark as sent immediately after approval (actual dispatch happens via message service)
    await db.update_outreach_queue_status(pending_id, "sent")
    logger.info("Admin %s approved outreach %s", admin.id, pending_id)
    return {"status": "approved_and_dispatched", "pending_id": pending_id}


@router.post("/outreach/{pending_id}/reject")
async def reject_outreach(
    pending_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Reject a pending outreach message."""
    db = get_postgres_client()
    entry = await db.get_outreach_pending(pending_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Outreach entry not found")
    if entry.get("status") != "pending_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject entry with status '{entry.get('status')}'",
        )
    await db.update_outreach_queue_status(pending_id, "rejected", approved_by=admin.id)
    logger.info("Admin %s rejected outreach %s", admin.id, pending_id)
    return {"status": "rejected", "pending_id": pending_id}


# --------------- User suspend / activate ---------------


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: Request,
    body: dict = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Suspend a user account and invalidate their refresh token."""
    if body is None:
        body = {}
    db = get_postgres_client()
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")
    await db.update_user(user_id, {"is_active": False})
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "suspend_user",
            "resource_type": "user",
            "resource_id": user_id,
            "details": {"reason": body.get("reason", ""), "suspended_user_email": user.email},
            "ip_address": request.client.host if request.client else None,
        }
    )
    from src.databases.pg_store import get_pg_store as _get_store

    store = _get_store()
    await store.delete(f"refresh_token:{user_id}")
    logger.info("Admin %s suspended user %s", admin.id, user_id)
    return {"status": "suspended", "user_id": user_id}


@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: str,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Reactivate a suspended user account."""
    db = get_postgres_client()
    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.update_user(user_id, {"is_active": True})
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "activate_user",
            "resource_type": "user",
            "resource_id": user_id,
            "details": {"activated_user_email": user.email},
            "ip_address": request.client.host if request.client else None,
        }
    )
    logger.info("Admin %s activated user %s", admin.id, user_id)
    return {"status": "active", "user_id": user_id}


# --------------- Agent audit log ---------------


@router.get("/agents/audit")
async def list_agent_audit(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    agent_name: str | None = None,
    requires_human_review: bool | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List paginated AI agent audit log entries."""
    db = get_postgres_client()
    items, total = await db.list_agent_audit_log(
        page=page,
        page_size=page_size,
        agent_name=agent_name,
        requires_human_review=requires_human_review,
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": (page * page_size) < total,
    }


# --------------- Agent autonomy modes (Task 3.1) ---------------


@router.get("/agents/autonomy")
async def get_agent_autonomy_modes(
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Return current autonomy mode for each agent.

    Reads from system_settings DB first (so admin UI changes take effect
    immediately without restart), falling back to env-based defaults.
    """
    from src.config.settings import get_settings

    env_settings = get_settings()
    db = get_postgres_client()
    rows = await db.get_system_settings()
    db_map = {row["key"]: row["value"] for row in rows}

    def _mode(key: str, env_default: str) -> str:
        val = db_map.get(key)
        return val if isinstance(val, str) and val else env_default

    return {
        "matching": _mode("MATCHING_AGENT_MODE", env_settings.MATCHING_AGENT_MODE),
        "pricing": _mode("PRICING_AGENT_MODE", env_settings.PRICING_AGENT_MODE),
        "vetting": _mode("VETTING_AGENT_MODE", env_settings.VETTING_AGENT_MODE),
        "outreach": _mode("OUTREACH_AGENT_MODE", env_settings.OUTREACH_AGENT_MODE),
        "payment": _mode("PAYMENT_AGENT_MODE", env_settings.PAYMENT_AGENT_MODE),
    }


# --------------- Pending agent decisions (Task 3.1 approval workflow) ---------------


@router.get("/agents/pending-decisions")
async def list_pending_decisions(
    status: str = "pending",
    agent_name: str | None = None,
    page: int = 1,
    page_size: int = 20,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List agent decisions queued for admin review (matching, pricing, vetting in gated/recommend mode)."""
    db = get_postgres_client()
    offset = (page - 1) * page_size
    items, total = await db.list_pending_decisions(status=status, agent_name=agent_name, limit=page_size, offset=offset)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/agents/pending-decisions/{decision_id}/approve")
async def approve_pending_decision(
    decision_id: str,
    note: str = "",
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Approve a pending agent decision.

    For action_type='refund_request', executes the refund exactly once (idempotent).
    Writes a formal audit_log entry for the approval and for any refund execution.
    """
    db = get_postgres_client()
    entry = await db.get_pending_decision(decision_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Pending decision not found")
    if entry.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Decision already resolved: {entry['status']}")

    updated = await db.update_pending_decision(
        decision_id,
        {
            "status": "approved",
            "decided_by": admin.id,
            "decision_note": note,
            "decided_at": datetime.now(UTC),
        },
    )
    logger.info("Admin %s approved decision %s (agent=%s)", admin.id, decision_id, entry.get("agent_name"))

    # Formal audit log for the approval decision
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "approve_pending_decision",
            "resource_type": "pending_decisions",
            "resource_id": decision_id,
            "details": {
                "agent_name": entry.get("agent_name"),
                "action_type": entry.get("action_type"),
                "decision_note": note,
            },
        }
    )

    # Execute the downstream action for refund_request approvals
    if entry.get("action_type") == "refund_request":
        payload = entry.get("payload") or {}
        payment_id = payload.get("payment_id")
        transaction_id = payload.get("transaction_id")
        amount = payload.get("amount")

        if payment_id:
            # Idempotency guard: skip if payment already refunded
            payment = await db.get_payment(payment_id)
            if payment and payment.get("status") == "refunded":
                logger.info(
                    "Admin %s: decision %s — payment %s already refunded, skipping execution",
                    admin.id,
                    decision_id,
                    payment_id,
                )
            else:
                try:
                    from src.services.payment import get_payment_provider

                    provider = get_payment_provider()
                    refund_txn_id = transaction_id or payment_id
                    refund_result = await provider.refund(transaction_id=refund_txn_id, amount=amount)

                    await db.update_payment(payment_id, {"status": refund_result.get("status", "refunded")})
                    if payment and payment.get("invoice_id"):
                        await db.update_invoice(payment["invoice_id"], {"status": "refunded"})

                    await db.create_audit_log(
                        {
                            "user_id": admin.id,
                            "action": "refund_executed",
                            "resource_type": "payments",
                            "resource_id": payment_id,
                            "details": {
                                "decision_id": decision_id,
                                "refund_id": refund_result.get("refund_id"),
                                "amount": amount,
                                "provider_status": refund_result.get("status"),
                            },
                        }
                    )
                    logger.info(
                        "Admin %s: refund executed — decision=%s payment=%s refund_id=%s",
                        admin.id,
                        decision_id,
                        payment_id,
                        refund_result.get("refund_id"),
                    )
                except Exception as exc:
                    logger.error(
                        "Admin %s: refund execution failed — decision=%s payment=%s error=%s",
                        admin.id,
                        decision_id,
                        payment_id,
                        exc,
                    )
                    await db.create_audit_log(
                        {
                            "user_id": admin.id,
                            "action": "refund_execution_failed",
                            "resource_type": "payments",
                            "resource_id": payment_id,
                            "details": {
                                "decision_id": decision_id,
                                "error": str(exc),
                            },
                        }
                    )
        else:
            logger.warning(
                "Admin %s: approved refund_request decision %s has no payment_id in payload",
                admin.id,
                decision_id,
            )
            await db.create_audit_log(
                {
                    "user_id": admin.id,
                    "action": "refund_skipped_no_payment_id",
                    "resource_type": "pending_decisions",
                    "resource_id": decision_id,
                    "details": {
                        "decision_id": decision_id,
                        "reason": "payload missing payment_id; refund not executed",
                        "payload": payload,
                    },
                }
            )
            updated["refund_skipped"] = True
            updated["refund_skip_reason"] = "payload missing payment_id"

    return updated


@router.post("/agents/pending-decisions/{decision_id}/reject")
async def reject_pending_decision(
    decision_id: str,
    note: str = "",
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Reject a pending agent decision. No downstream action is executed.

    Writes a formal audit_log entry for the rejection.
    """
    db = get_postgres_client()
    entry = await db.get_pending_decision(decision_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Pending decision not found")
    if entry.get("status") != "pending":
        raise HTTPException(status_code=409, detail=f"Decision already resolved: {entry['status']}")
    updated = await db.update_pending_decision(
        decision_id,
        {
            "status": "rejected",
            "decided_by": admin.id,
            "decision_note": note,
            "decided_at": datetime.now(UTC),
        },
    )
    logger.info("Admin %s rejected decision %s (agent=%s)", admin.id, decision_id, entry.get("agent_name"))

    # Formal audit log for the rejection decision
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "reject_pending_decision",
            "resource_type": "pending_decisions",
            "resource_id": decision_id,
            "details": {
                "agent_name": entry.get("agent_name"),
                "action_type": entry.get("action_type"),
                "decision_note": note,
            },
        }
    )

    return updated


@router.get("/agents/audit/{audit_id}")
async def get_agent_audit_entry(
    audit_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Get a single agent audit log entry including reasoning_chain (Task 3.6)."""
    db = get_postgres_client()
    agent_audit_log_cols = (
        "id, session_id, user_id, agent_name, action, input_summary, output_summary, "
        "model_used, tokens_used, latency_ms, confidence_score, requires_human_review, "
        "reasoning_chain, cited_sources, alternatives_considered, created_at"
    )
    entry = await db._pg_fetch_one(f"SELECT {agent_audit_log_cols} FROM agent_audit_log WHERE id = $1", audit_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    return dict(entry)


# --------------- Contractor verification metadata (Phase 2) ---------------


@router.get("/contractors/{contractor_id}/verification-metadata")
async def get_contractor_verification_metadata(
    contractor_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Get verification metadata for a contractor (external/official verification records).

    Phase 3: Augments with data.gov.il company registry lookup when available.
    Company registry is NOT contractor license verification — it is business name lookup only.
    """
    db = get_postgres_client()
    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    items = await db.get_contractor_verification_metadata(contractor_id)

    # Phase 3: augment with data.gov.il company registry lookup (not license verification)
    from src.services.enrichment import get_enrichment_service

    svc = get_enrichment_service()
    business_name = (contractor.get("business_name") or "").strip()
    if business_name and hasattr(svc, "search_registered_company"):
        companies = svc.search_registered_company(business_name)
        for c in companies:
            items.append(
                {
                    "id": f"datagov-{c.get('company_id', '')}",
                    "source": "data.gov.il (company registry)",
                    "verified": c.get("status") == "פעילה",
                    "confidence": 0.7 if c.get("status") == "פעילה" else 0.5,
                    "verified_at": datetime.now(UTC).isoformat(),
                    "raw_response": c,
                }
            )

    return {"items": items, "contractor_id": contractor_id}


# --------------- Refresh contractor verification from external registry ---------------


@router.post("/contractors/{contractor_id}/refresh-verification")
async def refresh_contractor_verification(
    contractor_id: str,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Trigger an on-demand re-check of the contractor against the external gov registry.

    Returns {found, verified, confidence, company} so the admin UI can surface
    the result immediately without a page reload.
    """
    db = get_postgres_client()
    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    from src.services.enrichment import get_enrichment_service

    svc = get_enrichment_service()
    business_name = (contractor.get("business_name") or "").strip()

    if not business_name or not hasattr(svc, "search_registered_company"):
        return {
            "found": False,
            "verified": False,
            "confidence": 0.0,
            "message": "No enrichment service or business name available for lookup.",
        }

    companies: list = svc.search_registered_company(business_name)
    if not companies:
        await db.create_audit_log(
            {
                "user_id": admin.id,
                "action": "refresh_contractor_verification",
                "resource_type": "contractor",
                "resource_id": contractor_id,
                "details": {"found": False, "business_name": business_name},
                "ip_address": request.client.host if request.client else None,
            }
        )
        return {"found": False, "verified": False, "confidence": 0.0}

    best = companies[0]
    verified = best.get("status") == "פעילה"
    confidence = 0.7 if verified else 0.5

    # Persist the refreshed verification metadata record
    try:
        await db.upsert_contractor_verification(
            contractor_id,
            "data.gov.il (company registry)",
            verified,
            confidence,
            {
                "verified_at": datetime.now(UTC).isoformat(),
                "metadata": best,
            },
        )
    except Exception:
        logger.warning("refresh_verification: could not persist metadata for contractor=%s", contractor_id)

    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "refresh_contractor_verification",
            "resource_type": "contractor",
            "resource_id": contractor_id,
            "details": {
                "found": True,
                "verified": verified,
                "confidence": confidence,
                "business_name": business_name,
            },
            "ip_address": request.client.host if request.client else None,
        }
    )

    logger.info(
        "Admin %s refreshed verification for contractor %s — verified=%s confidence=%.2f",
        admin.id,
        contractor_id,
        verified,
        confidence,
    )
    return {"found": True, "verified": verified, "confidence": confidence, "company": best}


# --------------- Request contractor documents ---------------


class RequestDocsBody(BaseModel):
    """Optional message when requesting documents from a contractor."""

    message: str = "Please upload additional documents to complete your verification."


@router.post("/contractors/{contractor_id}/request-docs")
async def request_contractor_docs(
    contractor_id: str,
    request: Request,
    body: RequestDocsBody | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, str]:
    """Request docs from contractor. Stored in Redis; contractor sees via GET /contractors/me/doc-requests."""
    db = get_postgres_client()
    contractor = await db.get_contractor(contractor_id)
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")

    store = get_pg_store()
    default_msg = "Please upload additional documents to complete your verification."
    payload = {
        "requested_at": datetime.now(UTC).isoformat(),
        "requested_by": admin.id,
        "requested_by_email": admin.email,
        "message": (body.message if body else "") or default_msg,
    }
    await store.set(
        f"doc_request:{contractor_id}",
        json.dumps(payload),
        ex=30 * 24 * 60 * 60,  # 30 days
    )

    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "request_docs",
            "resource_type": "contractor",
            "resource_id": contractor_id,
            "details": {"message": payload["message"]},
            "ip_address": request.client.host if request.client else None,
        }
    )

    logger.info("Admin %s requested docs from contractor %s", admin.email, contractor_id)

    return {"status": "doc_request_sent", "contractor_id": contractor_id}


@router.patch("/contractors/{contractor_id}/membership")
async def admin_patch_contractor_membership(
    contractor_id: str,
    body: ContractorMembershipAdminUpdate,
    request: Request,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Override contractor marketplace membership fields (manual comp, suspension, provider IDs)."""
    db = get_postgres_client()
    existing = await db.get_contractor(contractor_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Contractor not found")
    patch = body.model_dump(exclude_unset=True, mode="python")
    if not patch:
        return existing
    updated = await db.admin_update_contractor_membership(contractor_id, patch)
    await db.create_audit_log(
        {
            "user_id": admin.id,
            "action": "contractor_membership_update",
            "resource_type": "contractor",
            "resource_id": contractor_id,
            "details": {"patch": patch, "previous_status": existing.get("membership_status")},
            "ip_address": request.client.host if request.client else None,
        }
    )
    logger.info("Admin %s updated membership for contractor %s", admin.id, contractor_id)
    return updated


# ---------------------------------------------------------------------------
# Credit Awards admin endpoints
# ---------------------------------------------------------------------------


@router.get("/credit-awards")
async def list_credit_awards(
    resident_id: str | None = None,
    status: str | None = None,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """List credit awards, optionally filtered by resident or status."""
    db = get_postgres_client()
    items = await db.list_credit_awards(resident_id=resident_id, status=status)
    return {"items": items, "total": len(items)}


@router.post("/credit-awards/{award_id}/approve")
async def approve_credit_award(
    award_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Approve a pending credit award and mark it for application."""
    db = get_postgres_client()
    updated = await db.update_credit_award(
        award_id,
        {
            "status": "approved",
            "approved_by": admin.id,
            "approved_at": datetime.now(UTC),
        },
    )
    logger.info("Admin %s approved credit award %s", admin.id, award_id)
    return updated


@router.post("/credit-awards/{award_id}/reject")
async def reject_credit_award(
    award_id: str,
    admin: UserInDB = Depends(require_admin_only),
) -> dict[str, Any]:
    """Reject a pending credit award."""
    db = get_postgres_client()
    updated = await db.update_credit_award(award_id, {"status": "rejected", "approved_by": admin.id})
    logger.info("Admin %s rejected credit award %s", admin.id, award_id)
    return updated
