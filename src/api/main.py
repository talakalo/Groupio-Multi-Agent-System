"""FastAPI application for the Groupio Multi-Agent System."""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.api.middleware.auth import verify_api_key
from src.api.middleware.logging import RequestLoggingMiddleware
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.databases.vector_store import get_vector_store
from src.databases.graph_store import get_graph_store
from src.orchestration.graph import get_orchestrator
from src.rag.pipeline import get_rag_pipeline
from src.utils.monitoring import init_monitoring
from src.utils.validators import sanitize_input, validate_message_request

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    init_monitoring()
    logger.info("Groupio Agent API starting up")

    # Ensure vector DB collections exist
    try:
        vs = get_vector_store()
        await vs.ensure_collections()
        logger.info("Vector DB collections verified")
    except Exception:
        logger.warning("Could not verify vector DB collections")

    yield

    # Shutdown
    logger.info("Groupio Agent API shutting down")
    try:
        redis = get_redis_client()
        await redis.close()
    except Exception:
        pass
    try:
        graph = get_graph_store()
        await graph.close()
    except Exception:
        pass


app = FastAPI(
    title="Groupio Agent API",
    version="1.0.0",
    description="Multi-agent AI system for the Groupio marketplace",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)


# -- Request/Response Models --


class MessageRequest(BaseModel):
    """Incoming message request."""

    user_id: str
    message: str
    building_id: str | None = None
    channel: str = "web"


class MessageResponse(BaseModel):
    """Response to a message request."""

    conversation_id: str
    response: dict[str, Any]
    metadata: dict[str, Any]


# -- Endpoints --


@app.post("/api/v1/message", response_model=MessageResponse)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
) -> MessageResponse:
    """Main endpoint for processing user messages through the agent system."""
    # Validate request
    is_valid, reason = validate_message_request(request.model_dump())
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)

    # Sanitize input
    sanitized_message = sanitize_input(request.message)

    # Rate limiting
    redis = get_redis_client()
    settings = get_settings()
    allowed = await redis.check_rate_limit(
        request.user_id,
        limit=settings.RATE_LIMIT_PER_USER,
        window=settings.RATE_LIMIT_WINDOW,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    try:
        orchestrator = get_orchestrator()
        result = await orchestrator.run(
            user_message=sanitized_message,
            user_id=request.user_id,
            building_id=request.building_id,
        )

        # Log conversation asynchronously
        background_tasks.add_task(
            _log_conversation,
            user_id=request.user_id,
            message=sanitized_message,
            response=result["response"],
            metadata=result["metadata"],
        )

        return MessageResponse(
            conversation_id=result["conversation_id"],
            response=result["response"],
            metadata=result["metadata"],
        )

    except Exception as e:
        logger.error("Error processing message: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/v1/webhooks/whatsapp")
async def whatsapp_webhook(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Handle incoming WhatsApp messages."""
    try:
        message = _parse_whatsapp_message(payload)

        if not message:
            return {"status": "ignored"}

        db = get_postgres_client()
        building_id = await db.get_building_by_phone(message["phone_number"])

        orchestrator = get_orchestrator()
        result = await orchestrator.run(
            user_message=message["text"],
            user_id=message["phone_number"],
            building_id=building_id,
        )

        # Queue response send (in production, use BullMQ)
        background_tasks.add_task(
            _send_whatsapp_response,
            to=message["phone_number"],
            message=result["response"].get("message", ""),
        )

        return {"status": "processed"}

    except Exception as e:
        logger.error("WhatsApp webhook error: %s", e, exc_info=True)
        return {"status": "error"}


@app.get("/api/v1/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint for all services."""
    services: dict[str, bool] = {}

    try:
        vs = get_vector_store()
        services["vector_db"] = await vs.health_check()
    except Exception:
        services["vector_db"] = False

    try:
        gs = get_graph_store()
        services["graph_db"] = await gs.health_check()
    except Exception:
        services["graph_db"] = False

    try:
        redis = get_redis_client()
        services["redis"] = await redis.health_check()
    except Exception:
        services["redis"] = False

    try:
        db = get_postgres_client()
        services["postgres"] = await db.health_check()
    except Exception:
        services["postgres"] = False

    all_healthy = all(services.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services,
    }


# -- Admin Endpoints --


@app.post("/api/v1/admin/agents/{agent_name}/reload")
async def reload_agent(agent_name: str) -> dict[str, str]:
    """Reload an agent's configuration without restarting."""
    orchestrator = get_orchestrator()
    agent = orchestrator.agents.get(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    await agent.reload_config()
    return {"status": "reloaded", "agent": agent_name}


@app.get("/api/v1/admin/metrics")
async def get_metrics() -> dict[str, Any]:
    """Get system metrics for all agents and services."""
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


# -- Helper Functions --


async def _log_conversation(
    user_id: str,
    message: str,
    response: dict,
    metadata: dict,
) -> None:
    """Log conversation to database."""
    try:
        db = get_postgres_client()
        await db.log_conversation(user_id, message, response, metadata)
    except Exception:
        logger.warning("Failed to log conversation for user %s", user_id)


def _parse_whatsapp_message(payload: dict) -> dict[str, str] | None:
    """Parse incoming WhatsApp webhook payload."""
    try:
        entry = payload.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return None

        msg = messages[0]
        return {
            "phone_number": msg.get("from", ""),
            "text": msg.get("text", {}).get("body", ""),
            "type": msg.get("type", "text"),
        }
    except (IndexError, KeyError):
        return None


async def _send_whatsapp_response(to: str, message: str) -> None:
    """Send a WhatsApp message (stub for production integration)."""
    logger.info("WhatsApp response to %s: %s", to, message[:100])
