"""Scheduled tasks worker for periodic operations."""

import asyncio
import logging
from datetime import UTC, datetime

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
            if (datetime.now(UTC) - last_run).total_seconds() < task.interval_seconds:
                return

        # Try to acquire lock
        acquired = await redis.set(lock_key, "1", ex=task.interval_seconds, nx=True)
        if not acquired:
            return

        idempotency_key = f"scheduler:idempotent:{task.name}:{datetime.now(UTC).strftime('%Y%m%d%H%M')}"
        try:
            # Check idempotency to prevent double-processing on restart
            already_ran = await redis.get(idempotency_key)
            if already_ran:
                logger.info(
                    "Task %s already completed in this window (idempotency key exists), skipping",
                    task.name,
                )
                return

            logger.info("Running scheduled task: %s (idempotency=%s)", task.name, idempotency_key)
            await task.func()
            # Mark as completed with TTL matching the task interval
            await redis.set(idempotency_key, "done", ex=task.interval_seconds)
            await redis.set(last_run_key, datetime.now(UTC).isoformat())
            logger.info("Task %s completed successfully", task.name)
        finally:
            await redis.delete(lock_key)


scheduler = TaskScheduler()


# ------------------------------------------------------------------
# Scheduled Tasks
# ------------------------------------------------------------------


@scheduler.register("check_expired_offers", interval_seconds=3600)  # Hourly
async def check_expired_offers():
    """Close offers past their deadline and notify participants."""
    from src.services.email import get_email_service

    db = get_postgres_client()
    email_svc = get_email_service()
    # Get all pending/matching offers past deadline
    now = datetime.now(UTC)
    expired_offers = (
        await db.execute_query(
            "SELECT id, title FROM offers WHERE deadline < $1 AND status IN ('pending', 'matching', 'draft')",
            {"deadline": now.isoformat()},
        )
        if hasattr(db, "execute_query")
        else []
    )

    for offer in expired_offers:
        offer_id = offer["id"]
        offer_title = offer.get("title", "")
        # Fetch participants so we can notify them before cancelling
        try:
            participants = await db.get_offer_participants(offer_id)
        except Exception as exc:
            logger.warning("Could not fetch participants for expired offer %s: %s", offer_id, exc)
            participants = []

        # Cancel the offer
        try:
            await db.update_offer(offer_id, {"status": "cancelled"})
            logger.info("Expired offer %s cancelled", offer_id)
        except Exception as exc:
            logger.error("Failed to cancel expired offer %s: %s", offer_id, exc)
            continue  # Skip notifications if cancellation itself failed

        # Notify each participant
        for p in participants:
            p_email = p.get("email") or p.get("user_email", "")
            if not p_email:
                continue
            try:
                await email_svc.send_offer_cancelled(
                    to_email=p_email,
                    user_name=p.get("full_name") or p.get("user_name", "דייר"),
                    offer_title=offer_title,
                    reason="פג תוקף ההצעה",
                )
            except Exception as exc:
                logger.warning(
                    "Failed to send expiry notification to %s for offer %s: %s",
                    p_email,
                    offer_id,
                    exc,
                )


@scheduler.register("recalculate_trust_scores", interval_seconds=604800)  # Weekly
async def recalculate_trust_scores():
    """Recalculate trust scores for all active contractors."""
    db = get_postgres_client()
    contractors, _ = await db.list_contractors(filters={"verification_status": "verified"}, page=1, page_size=1000)
    for contractor in contractors:
        try:
            await db.update_contractor_rating(contractor["id"])
            logger.info("Recalculated trust score for contractor %s", contractor["id"])
        except Exception as exc:
            logger.error("Failed to recalculate for %s: %s", contractor["id"], exc)


@scheduler.register("cleanup_stale_conversations", interval_seconds=86400)  # Daily
async def cleanup_stale_conversations():
    """Clean up conversation data older than 90 days."""
    get_redis_client()
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
            "date": datetime.now(UTC).date().isoformat(),
            "active_offers": total_offers,
            "active_contractors": total_contractors,
            "generated_at": datetime.now(UTC).isoformat(),
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
