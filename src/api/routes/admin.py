"""Admin API routes for system management."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.middleware.auth import get_admin_user
from src.databases.vector_store import get_vector_store
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
from src.rag.pipeline import get_rag_pipeline

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(get_admin_user)],  # Require admin auth for all routes
)


class PromptUpdateRequest(BaseModel):
    """Request to update an agent's system prompt."""

    agent_name: str
    system_prompt: str


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
