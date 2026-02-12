"""Scheduled tasks worker for periodic operations."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client

logger = logging.getLogger(__name__)


class ScheduledTask:
    """Represents a periodic task."""
    def __init__(self, name: str, interval_seconds: int, func):
        self.name = name
        self.interval_seconds = interval_seconds
        self.func = func
        self.last_run: datetime | None = None


class TaskScheduler:
    """Simple Redis-lock-based task scheduler."""

    def __init__(self):
        self.tasks: list[ScheduledTask] = []
        self._running = False

    def register(self, name: str, interval_seconds: int):
        """Decorator to register a task."""
        def decorator(func):
            self.tasks.append(ScheduledTask(name, interval_seconds, func))
            return func
        return decorator

    async def start(self):
        """Run the scheduler loop."""
        self._running = True
        logger.info("Task scheduler started with %d tasks", len(self.tasks))
        while self._running:
            for task in self.tasks:
                try:
                    await self._try_run_task(task)
                except Exception as exc:
                    logger.error("Task %s failed: %s", task.name, exc, exc_info=True)
            await asyncio.sleep(10)  # Check every 10 seconds

    async def stop(self):
        self._running = False

    async def _try_run_task(self, task: ScheduledTask):
        """Run task if interval has elapsed, using Redis lock to prevent overlap."""
        redis = get_redis_client()
        lock_key = f"scheduler:lock:{task.name}"
        last_run_key = f"scheduler:last_run:{task.name}"

        # Check if enough time has passed
        last_run_str = await redis.get(last_run_key)
        if last_run_str:
            last_run = datetime.fromisoformat(last_run_str)
            if (datetime.now(timezone.utc) - last_run).total_seconds() < task.interval_seconds:
                return

        # Try to acquire lock
        acquired = await redis.set(lock_key, "1", ex=task.interval_seconds, nx=True)
        if not acquired:
            return

        try:
            logger.info("Running scheduled task: %s", task.name)
            await task.func()
            await redis.set(last_run_key, datetime.now(timezone.utc).isoformat())
            logger.info("Task %s completed", task.name)
        finally:
            await redis.delete(lock_key)


scheduler = TaskScheduler()


# ------------------------------------------------------------------
# Scheduled Tasks
# ------------------------------------------------------------------

@scheduler.register("check_expired_offers", interval_seconds=3600)  # Hourly
async def check_expired_offers():
    """Close offers past their deadline."""
    db = get_postgres_client()
    # Get all pending/matching offers past deadline
    now = datetime.now(timezone.utc)
    expired_offers = await db.execute_query(
        "SELECT id FROM offers WHERE deadline < $1 AND status IN ('pending', 'matching', 'draft')",
        {"deadline": now.isoformat()},
    )

    for offer in expired_offers:
        try:
            await db.update_offer(offer["id"], {"status": "cancelled"})
            logger.info("Expired offer %s cancelled", offer["id"])
        except Exception as exc:
            logger.error("Failed to cancel expired offer %s: %s", offer["id"], exc)


@scheduler.register("recalculate_trust_scores", interval_seconds=604800)  # Weekly
async def recalculate_trust_scores():
    """Recalculate trust scores for all active contractors."""
    db = get_postgres_client()
    contractors, _ = await db.list_contractors(
        filters={"verification_status": "verified"}, page=1, page_size=1000
    )
    for contractor in contractors:
        try:
            await db.update_contractor_rating(contractor["id"])
            logger.info("Recalculated trust score for contractor %s", contractor["id"])
        except Exception as exc:
            logger.error("Failed to recalculate for %s: %s", contractor["id"], exc)


@scheduler.register("cleanup_stale_conversations", interval_seconds=86400)  # Daily
async def cleanup_stale_conversations():
    """Clean up conversation data older than 90 days."""
    redis = get_redis_client()
    # Redis handles TTL automatically, but we log the cleanup
    logger.info("Stale conversation cleanup triggered (Redis TTL handles expiry)")


@scheduler.register("generate_daily_analytics", interval_seconds=86400)  # Daily
async def generate_daily_analytics():
    """Generate and cache daily analytics summary."""
    db = get_postgres_client()
    redis = get_redis_client()
    
    try:
        # Count active offers
        offers, total_offers = await db.list_offers({"status": "pending"}, page=1, page_size=1)
        
        # Count active contractors
        contractors, total_contractors = await db.list_contractors(
            {"verification_status": "verified"}, page=1, page_size=1
        )
        
        summary = {
            "date": datetime.now(timezone.utc).date().isoformat(),
            "active_offers": total_offers,
            "active_contractors": total_contractors,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        await redis.set("analytics:daily_summary", str(summary), ex=86400)
        logger.info("Daily analytics generated: %s", summary)
    except Exception as exc:
        logger.error("Failed to generate daily analytics: %s", exc)


async def run_scheduler():
    """Entry point to start the scheduler."""
    await scheduler.start()


if __name__ == "__main__":
    asyncio.run(run_scheduler())
