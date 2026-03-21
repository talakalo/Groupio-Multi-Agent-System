"""FastAPI application for the Groupio Multi-Agent System."""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from src.api.middleware.auth import get_current_user
from src.api.middleware.logging import RequestLoggingMiddleware
from src.api.middleware.security import SecurityHeadersMiddleware
from src.api.routes import api_router
from src.config.settings import get_settings
from src.databases.graph_store import get_graph_store
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.databases.vector_store import get_vector_store
from src.models.user import UserInDB
from src.orchestration.graph import get_orchestrator
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
        db = get_postgres_client()
        await db.close()
    except Exception:
        pass
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


def _is_db_connection_error(exc: Exception) -> bool:
    """True if exception is due to DB (e.g. PostgreSQL) not reachable."""
    if isinstance(exc, ConnectionRefusedError):
        return True
    if isinstance(exc, OSError) and getattr(exc, "errno", None) == 61:
        return True
    return False


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ensure CORS headers on error responses so browser shows real error, not CORS."""
    logger.exception("Unhandled exception: %s", exc)
    if _is_db_connection_error(exc):
        status_code = 503
        content = {"detail": "Database unavailable. Please try again later."}
    else:
        status_code = 500
        show_detail = get_settings().ENVIRONMENT == "development"
        content = {"detail": str(exc) if show_detail else "Internal server error"}
    response = JSONResponse(status_code=status_code, content=content)
    # Add CORS headers so browser doesn't mask error as CORS
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


# CORS middleware - origins loaded from environment
settings = get_settings()
cors_origins = list(settings.CORS_ORIGINS)
# Only add localhost origins in development — never in production/staging.
if settings.ENVIRONMENT == "development":
    _dev_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]
    for origin in _dev_origins:
        if origin not in cors_origins:
            cors_origins.append(origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
    expose_headers=["Authorization"],
)

# Security headers middleware (HSTS, CSP, X-Frame-Options, etc.)
app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)

# Request logging middleware (with PII redaction)
app.add_middleware(RequestLoggingMiddleware)

# Include API routes (auth, offers, contractors, buildings, etc.)
app.include_router(api_router, prefix="/api/v1")


@app.get(
    "/api/v1",
    summary="API root",
    description="Returns basic API information.",
    tags=["Health"],
)
async def api_root() -> dict[str, str]:
    """API root — confirms the service is reachable and shows the current version."""
    return {"version": "v1", "status": "ok", "docs": "/docs"}


# WebSocket routes (mounted separately – no prefix collision with REST routes)
from src.api.routes.websocket import router as ws_router

app.include_router(ws_router, prefix="/api/v1")


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


@app.post(
    "/api/v1/message",
    response_model=MessageResponse,
    summary="Process user message",
    description=(
        "Main endpoint for processing user messages through the "
        "multi-agent system. Validates input, checks rate limits, "
        "routes through the agent orchestrator, and returns the "
        "AI response."
    ),
)
async def send_message(
    request: MessageRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
) -> MessageResponse:
    """Main endpoint for processing user messages through the agent system."""
    # Override body-supplied user_id with the authenticated user's id
    # to prevent impersonation attacks.
    request.user_id = current_user.id

    # Validate request
    is_valid, reason = validate_message_request(request.model_dump())
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)

    # Sanitize input
    sanitized_message = sanitize_input(request.message)

    # Rate limiting (keyed on authenticated user id — not body-supplied)
    redis = get_redis_client()
    settings = get_settings()
    allowed = await redis.check_rate_limit(
        current_user.id,
        limit=settings.RATE_LIMIT_PER_USER,
        window=settings.RATE_LIMIT_WINDOW,
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    try:
        orchestrator = get_orchestrator()
        result = await orchestrator.run(
            user_message=sanitized_message,
            user_id=current_user.id,
            building_id=request.building_id,
        )

        # Log conversation asynchronously
        background_tasks.add_task(
            _log_conversation,
            user_id=current_user.id,
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


@app.get(
    "/api/v1/health/live",
    summary="Liveness probe",
    description="Simple liveness check — returns 200 if the process is running. No external calls.",
)
async def health_live() -> dict[str, str]:
    """Liveness probe: process is up. No DB or external calls."""
    return {"status": "ok"}


@app.get(
    "/api/v1/health",
    summary="Readiness probe",
    description="Checks connectivity to all backend services (PostgreSQL, Redis, Qdrant, Neo4j).",
)
async def health_check() -> dict[str, Any]:
    """Readiness probe: all services (DB, Redis, vector, graph) checked."""
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


@app.get(
    "/api/v1/health/db",
    summary="Database pool stats",
    description="Returns asyncpg connection pool statistics (Task 3.5).",
)
async def db_pool_health() -> dict:
    """Return DB pool size/free/used stats for monitoring."""
    from src.databases.postgres import get_postgres_client

    db = get_postgres_client()
    try:
        pool = await db._get_client()
        if db._use_supabase_client():
            return {"backend": "supabase", "pool_stats": "n/a"}
        return {
            "backend": "asyncpg",
            "pool_size": pool.get_size(),
            "free_connections": pool.get_idle_size(),
            "used_connections": pool.get_size() - pool.get_idle_size(),
        }
    except Exception as exc:
        return {"error": str(exc)}


@app.get("/metrics")
async def prometheus_metrics(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> Response:
    """Expose Prometheus metrics — requires a valid X-API-Key header."""
    _settings = get_settings()
    if _settings.API_KEYS:
        if not x_api_key or x_api_key not in _settings.API_KEYS:
            raise HTTPException(status_code=403, detail="Invalid or missing API key")

    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


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
