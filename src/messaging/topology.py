"""Declare RabbitMQ exchanges, queues, and bindings (idempotent)."""

from __future__ import annotations

import logging
from typing import Any

from src.config.settings import get_settings
from src.messaging import constants as c

logger = logging.getLogger(__name__)


async def declare_core_topology(channel: Any) -> Any:
    """Declare topic exchange and notification dispatch queue + DLQ."""
    import aio_pika

    settings = get_settings()
    name = settings.RABBITMQ_EXCHANGE_EVENTS or c.DEFAULT_EXCHANGE_EVENTS
    exchange = await channel.declare_exchange(name, aio_pika.ExchangeType.TOPIC, durable=True)

    dlx = await channel.declare_exchange(c.DLX_NOTIFICATIONS, aio_pika.ExchangeType.FANOUT, durable=True)
    q_dlq = await channel.declare_queue(c.QUEUE_NOTIFICATIONS_DLQ, durable=True)
    await q_dlq.bind(dlx)

    await channel.declare_queue(
        c.QUEUE_NOTIFICATIONS_RETRY,
        durable=True,
    )

    q_main = await channel.declare_queue(
        c.QUEUE_NOTIFICATIONS_DISPATCH,
        durable=True,
        arguments={
            "x-dead-letter-exchange": c.DLX_NOTIFICATIONS,
            "x-dead-letter-routing-key": "",
        },
    )
    await q_main.bind(exchange, routing_key="notifications.send_requested")

    logger.debug("RabbitMQ topology declared (exchange=%s)", name)
    return exchange


async def declare_crm_topology(channel: Any) -> None:
    """CRM sync queue + DLQ."""
    import aio_pika

    settings = get_settings()
    name = settings.RABBITMQ_EXCHANGE_EVENTS or c.DEFAULT_EXCHANGE_EVENTS
    exchange = await channel.declare_exchange(name, aio_pika.ExchangeType.TOPIC, durable=True)

    dlx = await channel.declare_exchange(c.DLX_CRM, aio_pika.ExchangeType.FANOUT, durable=True)
    q_dlq = await channel.declare_queue(c.QUEUE_CRM_DLQ, durable=True)
    await q_dlq.bind(dlx)

    q = await channel.declare_queue(
        c.QUEUE_CRM_SYNC,
        durable=True,
        arguments={
            "x-dead-letter-exchange": c.DLX_CRM,
            "x-dead-letter-routing-key": "",
        },
    )
    for rk in (
        "crm.contractor.registered",
        "crm.contractor.status_changed",
        "crm.contractor.documents_submitted",
        "crm.building.created",
        "crm.building.activated",
        "crm.escalation.created",
    ):
        await q.bind(exchange, routing_key=rk)


async def declare_payments_topology(channel: Any) -> None:
    """Payment side-effect queue + DLQ."""
    import aio_pika

    settings = get_settings()
    name = settings.RABBITMQ_EXCHANGE_EVENTS or c.DEFAULT_EXCHANGE_EVENTS
    exchange = await channel.declare_exchange(name, aio_pika.ExchangeType.TOPIC, durable=True)

    dlx = await channel.declare_exchange(c.DLX_PAYMENTS, aio_pika.ExchangeType.FANOUT, durable=True)
    q_dlq = await channel.declare_queue(c.QUEUE_PAYMENTS_DLQ, durable=True)
    await q_dlq.bind(dlx)

    q = await channel.declare_queue(
        c.QUEUE_PAYMENTS_EVENTS,
        durable=True,
        arguments={
            "x-dead-letter-exchange": c.DLX_PAYMENTS,
            "x-dead-letter-routing-key": "",
        },
    )
    for rk in ("payments.succeeded", "payments.failed", "payments.refund_processed", "invoices.created"):
        await q.bind(exchange, routing_key=rk)
