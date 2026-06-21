"""Scheduled tasks worker for periodic operations."""

import asyncio
import logging
from datetime import UTC, datetime

from src.databases.postgres import get_postgres_client

logger = logging.getLogger(__name__)


class ScheduledTask:
    """Represents a periodic task."""

    def __init__(self, name: str, interval_seconds: int, func):
        self.name = name
        self.interval_seconds = interval_seconds
        self.func = func
        self.last_run: datetime | None = None


class TaskScheduler:
    """Simple Postgres-lock-based task scheduler."""

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
        """Run task if interval has elapsed, using Postgres lock to prevent overlap."""
        from src.databases.pg_store import get_pg_store
        store = get_pg_store()

        # Ensure the lock row exists (idempotent)
        last_run = await store.get_scheduler_last_run(task.name)
        if last_run is not None:
            elapsed = (datetime.now(UTC) - last_run).total_seconds()
            if elapsed < task.interval_seconds:
                return

        # Atomic lock acquisition — rowcount=1 means we won
        acquired = await store.acquire_scheduler_lock(task.name, task.interval_seconds)
        if not acquired:
            return

        try:
            logger.info("Running scheduled task: %s", task.name)
            await task.func()
            logger.info("Task %s completed successfully", task.name)
        finally:
            await store.release_scheduler_lock(task.name)


scheduler = TaskScheduler()


# ------------------------------------------------------------------
# Scheduled Tasks
# ------------------------------------------------------------------


@scheduler.register("reconcile_stale_payments", interval_seconds=1800)  # Every 30 minutes
async def reconcile_stale_payments() -> None:
    """Detect payments stuck in 'processing' or 'pending' and reconcile against Stripe.

    A payment is considered stale if:
    - status='processing' for > 15 minutes (Stripe should have responded by then)
    - status='pending' for > 24 hours (user abandoned or webhook was missed)

    For each stale payment that has a provider_transaction_id (Stripe PaymentIntent),
    we fetch the live intent and align our local status.  Any transition is written
    to audit_logs so the escrow release path has a reliable trail.
    """
    import stripe as stripe_lib

    from src.config.settings import get_settings

    db = get_postgres_client()
    settings = get_settings()

    if not settings.STRIPE_SECRET_KEY:
        logger.warning("reconcile_stale_payments: STRIPE_SECRET_KEY not configured, skipping")
        return

    stripe_lib.api_key = settings.STRIPE_SECRET_KEY

    now = datetime.now(UTC)

    try:
        stale_rows = await db._pg_fetch_all(
            """
            SELECT id, user_id, offer_id, provider_transaction_id, status, amount, currency
            FROM payments
            WHERE (
                (status = 'processing' AND updated_at < NOW() - INTERVAL '15 minutes')
                OR (status = 'pending' AND updated_at < NOW() - INTERVAL '24 hours')
            )
            AND provider = 'stripe'
            AND provider_transaction_id IS NOT NULL
            LIMIT 100
            """,
        )
    except Exception as exc:
        logger.error("reconcile_stale_payments: failed to query stale payments: %s", exc)
        return

    if not stale_rows:
        logger.info("reconcile_stale_payments: no stale payments found")
        return

    logger.info("reconcile_stale_payments: found %d stale payment(s)", len(stale_rows))
    reconciled = 0

    for row in stale_rows:
        payment_id = row["id"]
        intent_id = row["provider_transaction_id"]
        old_status = row["status"]

        try:
            intent = await stripe_lib.PaymentIntent.retrieve_async(intent_id)
        except stripe_lib.error.StripeError as exc:
            logger.warning(
                "reconcile_stale_payments: Stripe error for payment %s (intent %s): %s",
                payment_id,
                intent_id,
                exc,
            )
            continue

        stripe_status = intent.get("status", "")
        # Map Stripe intent status → our payment status
        stripe_to_local: dict[str, str] = {
            "succeeded": "succeeded",
            "canceled": "failed",
            "requires_payment_method": "failed",
            "payment_failed": "failed",
        }
        new_status = stripe_to_local.get(stripe_status)
        if new_status is None or new_status == old_status:
            continue  # No actionable change

        try:
            await db._pg_execute(
                "UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2",
                new_status,
                payment_id,
            )
            await db.create_audit_log(
                {
                    "user_id": row["user_id"],
                    "action": "payment_reconciled",
                    "resource_type": "payment",
                    "resource_id": payment_id,
                    "details": {
                        "old_status": old_status,
                        "new_status": new_status,
                        "stripe_intent_status": stripe_status,
                        "intent_id": intent_id,
                        "reconciled_at": now.isoformat(),
                    },
                }
            )
            logger.info(
                "reconcile_stale_payments: payment %s %s → %s (Stripe: %s)",
                payment_id,
                old_status,
                new_status,
                stripe_status,
            )
            reconciled += 1
        except Exception as exc:
            logger.error(
                "reconcile_stale_payments: failed to update payment %s: %s",
                payment_id,
                exc,
            )

    logger.info("reconcile_stale_payments: reconciled %d / %d payments", reconciled, len(stale_rows))


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

        # Notify each participant concurrently (max 10 in flight) — PERF-4.
        sem = asyncio.Semaphore(10)

        async def _notify(p: dict) -> None:
            p_email = p.get("email") or p.get("user_email", "")
            if not p_email:
                return
            async with sem:
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

        await asyncio.gather(*(_notify(p) for p in participants))


@scheduler.register("recalculate_trust_scores", interval_seconds=604800)  # Weekly
async def recalculate_trust_scores():
    """Recalculate trust scores for all active contractors in a single batched pass."""
    db = get_postgres_client()
    contractors, _ = await db.list_contractors(
        filters={"verification_status": "verified", "marketplace_visible_only": False},
        page=1,
        page_size=1000,
    )
    ids = [c["id"] for c in contractors]
    if not ids:
        logger.info("recalculate_trust_scores: no verified contractors to process")
        return
    try:
        updated = await db.batch_update_contractor_ratings(ids)
        logger.info("recalculate_trust_scores: batch-updated %s of %s contractors", updated, len(ids))
    except Exception as exc:
        logger.exception("recalculate_trust_scores: batch update failed: %s", exc)


@scheduler.register("cleanup_stale_conversations", interval_seconds=86400)  # Daily
async def cleanup_stale_conversations():
    """Clean up conversation data older than 90 days."""
    from src.databases.pg_store import get_pg_store as _get_store
    store = _get_store()
    try:
        # Postgres conversation_messages rows do not have TTL; delete old rows explicitly.
        await store._pg_execute(
            "DELETE FROM conversation_messages WHERE created_at < NOW() - INTERVAL '90 days'"
        )
    except Exception as exc:
        logger.warning("cleanup_stale_conversations: could not delete old rows: %s", exc)
    logger.info("Stale conversation cleanup triggered (90-day cutoff)")


@scheduler.register("generate_daily_analytics", interval_seconds=86400)  # Daily
async def generate_daily_analytics():
    """Generate and cache daily analytics summary."""
    from src.databases.pg_store import get_pg_store as _get_store
    db = get_postgres_client()
    store = _get_store()

    try:
        # Count active offers
        offers, total_offers = await db.list_offers({"status": "pending"}, page=1, page_size=1)

        # Count active contractors
        contractors, total_contractors = await db.list_contractors(
            {"verification_status": "verified", "marketplace_visible_only": False},
            page=1,
            page_size=1,
        )

        summary = {
            "date": datetime.now(UTC).date().isoformat(),
            "active_offers": total_offers,
            "active_contractors": total_contractors,
            "generated_at": datetime.now(UTC).isoformat(),
        }

        await store.cache_set("analytics:daily_summary", summary, ttl=86400)
        logger.info("Daily analytics generated: %s", summary)
    except Exception as exc:
        logger.error("Failed to generate daily analytics: %s", exc)


@scheduler.register("refresh_building_similarity", interval_seconds=86400)  # Nightly
async def refresh_building_similarity():
    """Compute and materialise SIMILAR_TO edges between buildings per region."""
    from src.databases.graph_store import get_graph_store

    db = get_postgres_client()
    graph = get_graph_store()

    try:
        regions = await db.get_distinct_regions()
    except Exception as exc:
        logger.warning("Could not fetch distinct regions: %s", exc)
        regions = []

    if not regions:
        # Fall back to a single global pass when region list unavailable
        count = await graph.compute_and_store_similarity_edges()
        logger.info("Building similarity edges refreshed (global): %d edges", count)
        return

    total = 0
    for region in regions:
        try:
            count = await graph.compute_and_store_similarity_edges(region=region)
            total += count
        except Exception as exc:
            logger.error("Failed to refresh similarity edges for region %s: %s", region, exc)

    logger.info("Building similarity edges refreshed for %d regions: %d total edges", len(regions), total)


@scheduler.register("refresh_influencer_scores", interval_seconds=86400)  # Nightly
async def refresh_influencer_scores():
    """Recompute materialised INFLUENCED edges for all residents, grouped by city."""
    from src.databases.graph_store import get_graph_store

    db = get_postgres_client()
    graph = get_graph_store()

    try:
        cities = await db.get_distinct_cities()
    except Exception as exc:
        logger.warning("Could not fetch distinct cities: %s", exc)
        cities = []

    total = 0
    for city in cities:
        try:
            count = await graph.refresh_influence_scores_for_city(city=city)
            total += count
        except Exception as exc:
            logger.error("Failed to refresh influence scores for city %s: %s", city, exc)

    logger.info("Influencer scores refreshed for %d cities: %d total edges", len(cities), total)


async def run_scheduler():
    """Entry point to start the scheduler."""
    await scheduler.start()


if __name__ == "__main__":
    asyncio.run(run_scheduler())
