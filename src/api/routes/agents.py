"""Agent-related API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.middleware.auth import require_admin_only
from src.orchestration.graph import get_orchestrator

router = APIRouter(
    tags=["agents"],
    # P0 SECURITY: agent management is platform-admin only (admin, super_admin).
    # buildings_manager must NOT have access to agent invocation or metrics.
    dependencies=[Depends(require_admin_only)],
)


class AgentInvokeRequest(BaseModel):
    """Request to directly invoke a specific agent."""

    agent_name: str
    user_id: str
    message: str
    building_id: str | None = None
    context: dict[str, Any] = {}


class AgentInvokeResponse(BaseModel):
    """Response from direct agent invocation."""

    agent_name: str
    result: dict[str, Any]


@router.post("/invoke", response_model=AgentInvokeResponse)
async def invoke_agent(request: AgentInvokeRequest) -> AgentInvokeResponse:
    """Directly invoke a specific agent (for testing/admin use)."""
    orchestrator = get_orchestrator()

    agent = orchestrator.agents.get(request.agent_name)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{request.agent_name}' not found",
        )

    from src.orchestration.state import create_initial_state

    state = create_initial_state(
        user_message=request.message,
        user_id=request.user_id,
        building_id=request.building_id,
    )

    # Inject any extra context
    state.update(request.context)

    result_state = await agent.run(state)

    return AgentInvokeResponse(
        agent_name=request.agent_name,
        result={
            "actions_taken": result_state.get("actions_taken", []),
            "intent": result_state.get("intent"),
            "confidence": result_state.get("confidence", 0),
            "needs_human": result_state.get("needs_human", False),
        },
    )


@router.get("/")
async def list_agents() -> dict[str, list[dict[str, str]]]:
    """List all available agents."""
    orchestrator = get_orchestrator()
    agents = []
    for name, agent in orchestrator.agents.items():
        agents.append(
            {
                "name": name,
                "description": agent.config.description,
                "model": agent.config.model,
            }
        )
    return {"agents": agents}


@router.get("/{agent_name}/metrics")
async def get_agent_metrics(agent_name: str) -> dict[str, Any]:
    """Get metrics for a specific agent."""
    orchestrator = get_orchestrator()
    agent = orchestrator.agents.get(agent_name)
    if not agent:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found",
        )
    return await agent.get_metrics()
