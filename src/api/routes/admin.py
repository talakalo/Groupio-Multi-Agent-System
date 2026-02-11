"""Admin API routes for system management."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from src.api.middleware.auth import get_admin_user
from src.databases.postgres import get_postgres_client
from src.databases.vector_store import get_vector_store
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
from src.rag.pipeline import get_rag_pipeline

router = APIRouter(
    tags=["admin"],
    dependencies=[Depends(get_admin_user)],  # Require admin auth for all routes
)


@router.get("/analytics")
async def get_analytics() -> dict[str, Any]:
    """Dashboard analytics (counts and derived metrics)."""
    db = get_postgres_client()
    open_tickets = 0
    total_contractors = 0
    try:
        stats = await db.get_escalation_stats()
        if isinstance(stats, dict):
            by_status = stats.get("by_status") or {}
            open_tickets = sum(
                c for s, c in by_status.items()
                if s and s != "resolved" and s != "closed"
            )
    except Exception:
        pass
    try:
        _, total_contractors = await db.list_contractors(
            filters={}, page=1, page_size=1
        )
    except Exception:
        pass
    return {
        "gmv_today": 0,
        "gmv_change": 0,
        "active_offers": 0,
        "active_offers_change": 0,
        "pending_verifications": 0,
        "urgent_verifications": 0,
        "open_tickets": open_tickets,
        "open_tickets_change": 0,
        "total_contractors": total_contractors,
    }


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
    """Dashboard analytics (admin). Aggregates from DB when available; otherwise placeholder."""
    try:
        db = get_postgres_client()
        stats = await db.get_escalation_stats()
        by_status = stats.get("by_status") or {}
        open_count = sum(
            c for s, c in by_status.items()
            if str(s).lower() not in ("resolved", "closed")
        )
        return {
            "gmvToday": 0,
            "gmvChange": 0,
            "activeOffers": 0,
            "activeOffersChange": 0,
            "openTickets": open_count,
            "openTicketsChange": 0,
            "resolvedToday": 0,
        }
    except Exception:
        return {
            "gmvToday": 0,
            "gmvChange": 0,
            "activeOffers": 0,
            "activeOffersChange": 0,
            "openTickets": 0,
            "openTicketsChange": 0,
            "resolvedToday": 0,
        }
