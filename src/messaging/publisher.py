"""Publish events to the topic exchange (optional / best-effort)."""

from __future__ import annotations

import json
import logging
from typing import Any

from src.config.settings import get_settings
from src.messaging.envelope import EventEnvelope
from src.utils.monitoring import messaging_publish_total

logger = logging.getLogger(__name__)


async def publish_event(
    routing_key: str,
    envelope: EventEnvelope,
    *,
    mandatory: bool = False,
) -> bool:
    """Publish a JSON envelope to ``RABBITMQ_EXCHANGE_EVENTS``.

    Returns True if published (or if publishing is disabled — **no-op success** for callers
    that should not treat disabled messaging as failure).

    Returns False if enabled but publish failed (logs error).
    """
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ:
        logger.debug("publish_event skipped: ENABLE_RABBITMQ is False (%s)", routing_key)
        return True

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        logger.warning("publish_event skipped: RABBITMQ_URL empty (%s)", routing_key)
        return False

    try:
        import aio_pika
    except ImportError:
        logger.error("aio-pika missing — cannot publish %s", routing_key)
        return False

    body = json.dumps(envelope.to_json_dict(), separators=(",", ":"), default=str).encode("utf-8")

    try:
        connection = await aio_pika.connect_robust(url)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                settings.RABBITMQ_EXCHANGE_EVENTS,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
            await exchange.publish(
                aio_pika.Message(
                    body=body,
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=routing_key,
                mandatory=mandatory,
            )
        logger.info("Published event %s rk=%s", envelope.event_name, routing_key)
        messaging_publish_total.labels(result="success").inc()
        return True
    except Exception:
        logger.exception("publish_event failed rk=%s event=%s", routing_key, envelope.event_name)
        messaging_publish_total.labels(result="error").inc()
        return False


async def publish_json_raw(routing_key: str, body_dict: dict[str, Any]) -> bool:
    """Publish raw JSON dict (used by outbox dispatcher).

    Returns False when RabbitMQ is disabled or publish fails — **never** pretend success here,
    so the outbox dispatcher does not mark rows published without a broker.
    """
    settings = get_settings()
    if not settings.ENABLE_RABBITMQ:
        logger.debug("publish_json_raw skipped: ENABLE_RABBITMQ is False (%s)", routing_key)
        return False

    url = (settings.RABBITMQ_URL or "").strip()
    if not url:
        return False

    try:
        import aio_pika
    except ImportError:
        return False

    body = json.dumps(body_dict, separators=(",", ":"), default=str).encode("utf-8")

    try:
        connection = await aio_pika.connect_robust(url)
        async with connection:
            channel = await connection.channel()
            exchange = await channel.declare_exchange(
                settings.RABBITMQ_EXCHANGE_EVENTS,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
            await exchange.publish(
                aio_pika.Message(
                    body=body,
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=routing_key,
            )
        messaging_publish_total.labels(result="success").inc()
        return True
    except Exception:
        logger.exception("publish_json_raw failed rk=%s", routing_key)
        messaging_publish_total.labels(result="error").inc()
        return False
