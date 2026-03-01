"""Monitoring, metrics, and logging utilities.

Logging is configured via structlog (JSON in production, coloured console in dev):
  - Production:  `ENVIRONMENT=production` → JSONRenderer → machine-parseable logs
  - Development: any other value → ConsoleRenderer → human-readable coloured logs

Usage across the codebase:
    from src.utils.monitoring import get_logger
    log = get_logger(__name__)
    log.info("offer_joined", offer_id=offer.id, user_id=user.id)
"""

import functools
import logging
import time
from collections.abc import Callable
from typing import Any

import structlog
from prometheus_client import Counter, Gauge, Histogram

from src.config.settings import get_settings

# ---------------------------------------------------------------------------
# Structlog configuration — called once at import time.
# ---------------------------------------------------------------------------


def _configure_structlog() -> None:
    settings = get_settings()
    is_production = settings.ENVIRONMENT in ("production", "staging")

    shared_processors: list[structlog.types.Processor] = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer() if is_production else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging through structlog so FastAPI/uvicorn logs are
    # formatted the same way as application logs.
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, get_settings().LOG_LEVEL, logging.INFO),
    )


_configure_structlog()


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound to the given module name."""
    return structlog.get_logger(name)


# Module-level logger (backward-compat for code using `logger` directly)
logger = get_logger(__name__)

# -- Prometheus Metrics --

agent_requests = Counter(
    "agent_requests_total",
    "Total agent requests",
    ["agent_name"],
)

agent_duration = Histogram(
    "agent_duration_seconds",
    "Agent execution time in seconds",
    ["agent_name"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

rag_retrievals = Counter(
    "rag_retrievals_total",
    "Total RAG retrieval operations",
    ["namespace", "strategy"],
)

llm_tokens = Counter(
    "llm_tokens_total",
    "Total LLM tokens used",
    ["model", "direction"],
)

errors_total = Counter(
    "errors_total",
    "Total errors by type",
    ["error_type", "agent_name"],
)

active_conversations = Gauge(
    "active_conversations",
    "Number of active conversations",
)

escalations_total = Counter(
    "escalations_total",
    "Total escalations to human agents",
    ["reason"],
)


# -- Sentry Initialization --


def init_monitoring() -> None:
    """Initialize monitoring services (Sentry, logging)."""
    settings = get_settings()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Initialize Sentry if configured
    if settings.SENTRY_DSN:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration

            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                traces_sample_rate=0.1,
                profiles_sample_rate=0.1,
                integrations=[FastApiIntegration()],
            )
            logger.info("Sentry initialized")
        except ImportError:
            logger.warning("sentry-sdk not installed, skipping Sentry init")


# -- Decorators --


def track_agent_execution(agent_name: str) -> Callable:
    """Decorator to track agent execution metrics."""

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            agent_requests.labels(agent_name=agent_name).inc()
            start_time = time.time()

            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                errors_total.labels(
                    error_type=type(e).__name__,
                    agent_name=agent_name,
                ).inc()
                logger.error("Error in agent %s: %s", agent_name, e, exc_info=True)
                raise
            finally:
                duration = time.time() - start_time
                agent_duration.labels(agent_name=agent_name).observe(duration)
                logger.info(
                    "Agent %s completed in %.3fs",
                    agent_name,
                    duration,
                )

        return wrapper

    return decorator


def track_rag_retrieval(namespace: str, strategy: str) -> None:
    """Track a RAG retrieval operation."""
    rag_retrievals.labels(namespace=namespace, strategy=strategy).inc()


def track_llm_usage(model: str, input_tokens: int, output_tokens: int) -> None:
    """Track LLM token usage."""
    llm_tokens.labels(model=model, direction="input").inc(input_tokens)
    llm_tokens.labels(model=model, direction="output").inc(output_tokens)


def track_escalation(reason: str) -> None:
    """Track an escalation event."""
    escalations_total.labels(reason=reason).inc()


# -- Request ID --

import uuid


def generate_request_id() -> str:
    """Generate a unique request ID for tracking."""
    return str(uuid.uuid4())


def generate_conversation_id() -> str:
    """Generate a unique conversation ID."""
    return f"conv_{uuid.uuid4().hex[:16]}"
