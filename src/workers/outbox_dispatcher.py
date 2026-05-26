"""Poll outbox_events and publish to RabbitMQ (standalone worker)."""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import sys
from typing import Any

from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.messaging.publisher import publish_json_raw

logger = logging.getLogger(__name__)


async def _process_outbox_rows(db: Any, rows: list) -> None:
    """Publish one batch of pending rows (testable unit)."""
    for row in rows:
        oid = row.get("id")
        rk = row.get("routing_key") or ""
        payload = row.get("payload") or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                await db.mark_outbox_event_failed(oid, "invalid payload json")
                continue

        ok = await publish_json_raw(rk, payload if isinstance(payload, dict) else {})
        if ok:
            await db.mark_outbox_event_published(str(oid))
        else:
            await db.mark_outbox_event_failed(str(oid), "publish_json_raw failed or broker unavailable")
            logger.warning(
                "outbox publish failed id=%s rk=%s — attempts incremented; "
                "rows with attempts >= 50 are skipped until requeue",
                oid,
                rk,
            )


async def run_loop() -> None:
    settings = get_settings()
    if not settings.ENABLE_OUTBOX:
        logger.info("Outbox dispatcher exiting: ENABLE_OUTBOX is False")
        return

    db = get_postgres_client()
    interval = max(0.05, settings.OUTBOX_POLL_INTERVAL_MS / 1000.0)
    running = True

    def _stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logger.info("Outbox dispatcher started (interval=%ss)", interval)

    while running:
        if not settings.ENABLE_RABBITMQ:
            logger.warning(
                "ENABLE_OUTBOX is True but ENABLE_RABBITMQ is False — not publishing; fix flags or start broker"
            )
            await asyncio.sleep(5.0)
            continue

        try:
            rows = await db.fetch_pending_outbox_events(50)
        except Exception:
            logger.exception("fetch_pending_outbox_events failed")
            await asyncio.sleep(interval)
            continue

        if rows:
            await _process_outbox_rows(db, rows)

        await asyncio.sleep(interval)

    try:
        await db.close()
    except Exception:
        pass
    logger.info("Outbox dispatcher stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_loop())


if __name__ == "__main__":
    main()
    sys.exit(0)
