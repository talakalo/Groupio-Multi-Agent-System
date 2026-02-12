"""Admin API routes for system management."""

from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr

from src.api.middleware.auth import get_admin_user, hash_password
from src.databases.postgres import get_postgres_client
from src.databases.vector_store import get_vector_store
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
from src.rag.pipeline import get_rag_pipeline


# --------------- Pydantic request models ---------------

class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str
    role: str = "admin"

router = APIRouter(
    tags=["admin"],
    dependencies=[Depends(get_admin_user)],  # Require admin auth for all routes
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
        open_tickets = sum(
            c for s, c in by_status.items() if str(s).lower() not in ("resolved", "closed")
        )
        resolved_today = by_status.get("resolved", 0)
    except Exception:
        pass

    # --- Offer stats (active count + GMV) ---
    try:
        offers, total_offers = await db.get_all_offers_admin(
            page=1, page_size=1, status="active"
        )
        active_offers = total_offers
    except Exception:
        pass

    try:
        # Sum the price of today's completed offers for GMV
        from datetime import date, datetime

        today_str = date.today().isoformat()
        completed_offers, _ = await db.get_all_offers_admin(
            page=1, page_size=1000, status="completed"
        )
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
        pass

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
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """List users with pagination and optional filters."""
    db = get_postgres_client()
    items, total = await db.get_admin_users(
        page=page, page_size=page_size, role=role, is_active=is_active
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    admin: UserInDB = Depends(get_admin_user),
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
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Update user role / is_active status."""
    db = get_postgres_client()
    update_data: dict[str, Any] = {}
    if body.role is not None:
        update_data["role"] = body.role
    if body.is_active is not None:
        update_data["is_active"] = body.is_active
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Allow role updates by extending the allowed set in update_user
    user = await db.update_user(user_id, update_data)
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "update_user",
        "resource_type": "user",
        "resource_id": user_id,
        "details": update_data,
        "ip_address": request.client.host if request.client else None,
    })
    return {"id": user.id, "role": user.role, "is_active": user.is_active}


@router.post("/users")
async def create_admin_user(
    body: AdminUserCreate,
    request: Request,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Create a new admin / staff user."""
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
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "create_user",
        "resource_type": "user",
        "resource_id": user_id,
        "details": {"role": body.role, "email": body.email},
        "ip_address": request.client.host if request.client else None,
    })
    return {"id": user.id, "email": user.email, "role": user.role}


# --------------- Offer management ---------------


@router.get("/offers")
async def list_offers_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    category: Optional[str] = None,
    flagged: Optional[bool] = None,
    admin: UserInDB = Depends(get_admin_user),
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
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Flag an offer for review."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    updated = await db.update_offer(offer_id, {"status": "flagged"})
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "flag_offer",
        "resource_type": "offer",
        "resource_id": offer_id,
        "ip_address": request.client.host if request.client else None,
    })
    return updated


@router.post("/offers/{offer_id}/approve")
async def approve_offer(
    offer_id: str,
    request: Request,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Approve a flagged offer."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    updated = await db.update_offer(offer_id, {"status": "active"})
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "approve_offer",
        "resource_type": "offer",
        "resource_id": offer_id,
        "ip_address": request.client.host if request.client else None,
    })
    return updated


@router.post("/offers/{offer_id}/cancel")
async def cancel_offer(
    offer_id: str,
    request: Request,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Cancel an offer."""
    db = get_postgres_client()
    offer = await db.get_offer(offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    updated = await db.update_offer(offer_id, {"status": "cancelled"})
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "cancel_offer",
        "resource_type": "offer",
        "resource_id": offer_id,
        "ip_address": request.client.host if request.client else None,
    })
    return updated


# --------------- System settings ---------------


@router.get("/settings")
async def get_settings(
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Get all system settings as key-value pairs."""
    db = get_postgres_client()
    rows = await db.get_system_settings()
    return {row["key"]: row["value"] for row in rows}


@router.put("/settings")
async def update_settings(
    body: dict[str, Any],
    request: Request,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """Update system settings (body: dict of key-value pairs)."""
    db = get_postgres_client()
    for key, value in body.items():
        await db.upsert_system_setting(
            key=key, value=value, updated_by=admin.id
        )
    await db.create_audit_log({
        "user_id": admin.id,
        "action": "update_settings",
        "resource_type": "system_settings",
        "details": {"keys": list(body.keys())},
        "ip_address": request.client.host if request.client else None,
    })
    # Return the refreshed settings
    rows = await db.get_system_settings()
    return {row["key"]: row["value"] for row in rows}


# --------------- Audit logs ---------------


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    admin: UserInDB = Depends(get_admin_user),
) -> dict[str, Any]:
    """List audit logs with pagination and optional filters."""
    db = get_postgres_client()
    items, total = await db.list_audit_logs(
        page=page, page_size=page_size, action=action, resource_type=resource_type
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}
