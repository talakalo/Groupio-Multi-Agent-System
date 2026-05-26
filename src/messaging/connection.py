"""RabbitMQ connection bootstrap — optional and non-fatal when disabled."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from src.config.settings import get_settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    pass


async def connect_rabbitmq_robust() -> Any | None:
    """Return a robust aio-pika connection, or None if messaging is disabled or misconfigured.

    Never raises for configuration reasons — callers decide whether connection failure is fatal
    (workers: yes; API process: should not call this at import time).
    """
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ:
        logger.debug("RabbitMQ skipped: ENABLE_RABBITMQ is False")
        return None

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        logger.warning("ENABLE_RABBITMQ is True but RABBITMQ_URL is empty — cannot connect")
        return None

    try:
        import aio_pika
    except ImportError as exc:
        logger.error("aio-pika is not installed: %s", exc)
        return None

    try:
        connection = await aio_pika.connect_robust(url)
        logger.info("Connected to RabbitMQ")
        return connection
    except Exception:
        logger.exception("Failed to connect to RabbitMQ at %s", url.split("@")[-1] if "@" in url else "<hidden>")
        return None
