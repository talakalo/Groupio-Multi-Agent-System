"""Unit tests for scheduled task functions and TaskScheduler.start()."""

from unittest.mock import AsyncMock, patch

import pytest

from src.workers.scheduler import (
    TaskScheduler,
    check_expired_offers,
    cleanup_stale_conversations,
    generate_daily_analytics,
    recalculate_trust_scores,
)

# ---------------------------------------------------------------------------
# start() / stop()
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_runs_one_iteration_then_stops():
    """start() loops until _running=False; task errors are caught and logged."""
    sched = TaskScheduler()
    call_count = 0

    @sched.register("probe", interval_seconds=1)
    async def _probe():
        nonlocal call_count
        call_count += 1

    async def _fake_try(task):
        await task.func()
        sched._running = False  # stop after first task run

    with patch.object(sched, "_try_run_task", side_effect=_fake_try):
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await sched.start()

    assert call_count == 1


@pytest.mark.asyncio
async def test_start_logs_task_exception():
    """Exceptions raised by _try_run_task are caught and do not abort the loop."""
    sched = TaskScheduler()
    call_count = 0

    @sched.register("bad_task", interval_seconds=60)
    async def _bad():
        pass

    async def _explode(task):
        nonlocal call_count
        call_count += 1
        sched._running = False
        raise RuntimeError("boom")

    with patch.object(sched, "_try_run_task", side_effect=_explode):
        with patch("asyncio.sleep", new_callable=AsyncMock):
            await sched.start()  # should not raise

    assert call_count == 1


# ---------------------------------------------------------------------------
# _try_run_task – idempotency branch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_try_run_task_skips_if_idempotency_key_set():
    """If the idempotency key is already set the task func is NOT called."""
    sched = TaskScheduler()
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=[None, "done"])  # no last_run, but idempotent
    mock_redis.set = AsyncMock(return_value=True)
    mock_redis.delete = AsyncMock()

    from src.workers.scheduler import ScheduledTask

    func = AsyncMock()
    task = ScheduledTask("idem_task", 3600, func)

    with patch("src.workers.scheduler.get_redis_client", return_value=mock_redis):
        await sched._try_run_task(task)

    func.assert_not_called()
    mock_redis.delete.assert_called_once()


# ---------------------------------------------------------------------------
# check_expired_offers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_expired_offers_no_offers():
    """check_expired_offers with empty DB result completes silently."""
    db = AsyncMock()
    db.execute_query = AsyncMock(return_value=[])
    email = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email):
            await check_expired_offers()

    email.send_offer_cancelled.assert_not_called()


@pytest.mark.asyncio
async def test_check_expired_offers_cancels_and_notifies():
    """check_expired_offers cancels expired offers and notifies participants."""
    offer = {"id": "o1", "title": "Solar Deal"}
    participant = {"email": "user@test.com", "full_name": "Test User"}

    db = AsyncMock()
    db.execute_query = AsyncMock(return_value=[offer])
    db.get_offer_participants = AsyncMock(return_value=[participant])
    db.update_offer = AsyncMock()

    email_svc = AsyncMock()
    email_svc.send_offer_cancelled = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email_svc):
            await check_expired_offers()

    db.update_offer.assert_called_once_with("o1", {"status": "cancelled"})
    email_svc.send_offer_cancelled.assert_called_once()


@pytest.mark.asyncio
async def test_check_expired_offers_skips_participant_without_email():
    """Participants without email are skipped silently."""
    offer = {"id": "o2", "title": "Deal"}
    participant = {"email": "", "full_name": "Anonymous"}

    db = AsyncMock()
    db.execute_query = AsyncMock(return_value=[offer])
    db.get_offer_participants = AsyncMock(return_value=[participant])
    db.update_offer = AsyncMock()

    email_svc = AsyncMock()
    email_svc.send_offer_cancelled = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email_svc):
            await check_expired_offers()

    email_svc.send_offer_cancelled.assert_not_called()


@pytest.mark.asyncio
async def test_check_expired_offers_handles_cancel_failure():
    """If cancelling an offer fails, the loop continues to the next offer."""
    offer1 = {"id": "bad", "title": "Bad"}
    offer2 = {"id": "good", "title": "Good"}
    participant = {"email": "a@b.com", "full_name": "A B"}

    db = AsyncMock()
    db.execute_query = AsyncMock(return_value=[offer1, offer2])
    db.get_offer_participants = AsyncMock(return_value=[participant])
    db.update_offer = AsyncMock(side_effect=[RuntimeError("db error"), None])

    email_svc = AsyncMock()
    email_svc.send_offer_cancelled = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email_svc):
            await check_expired_offers()

    # Second offer should still be processed
    assert db.update_offer.call_count == 2
    email_svc.send_offer_cancelled.assert_called_once()


@pytest.mark.asyncio
async def test_check_expired_offers_handles_participants_fetch_error():
    """If fetching participants fails, continues with empty participant list."""
    offer = {"id": "o1", "title": "Deal"}

    db = AsyncMock()
    db.execute_query = AsyncMock(return_value=[offer])
    db.get_offer_participants = AsyncMock(side_effect=RuntimeError("fetch error"))
    db.update_offer = AsyncMock()

    email_svc = AsyncMock()
    email_svc.send_offer_cancelled = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email_svc):
            await check_expired_offers()

    db.update_offer.assert_called_once_with("o1", {"status": "cancelled"})


@pytest.mark.asyncio
async def test_check_expired_offers_db_no_execute_query():
    """If db has no execute_query attribute, expired_offers defaults to []."""
    db = AsyncMock(spec=[])  # no execute_query method
    email_svc = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.services.email.get_email_service", return_value=email_svc):
            await check_expired_offers()

    email_svc.send_offer_cancelled.assert_not_called()


# ---------------------------------------------------------------------------
# recalculate_trust_scores
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recalculate_trust_scores_empty():
    """recalculate_trust_scores with no contractors completes silently."""
    db = AsyncMock()
    db.list_contractors = AsyncMock(return_value=([], 0))

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        await recalculate_trust_scores()

    db.update_contractor_rating.assert_not_called()


@pytest.mark.asyncio
async def test_recalculate_trust_scores_success():
    """recalculate_trust_scores calls update_contractor_rating for each contractor."""
    contractors = [{"id": "c1"}, {"id": "c2"}]
    db = AsyncMock()
    db.list_contractors = AsyncMock(return_value=(contractors, 2))
    db.update_contractor_rating = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        await recalculate_trust_scores()

    assert db.update_contractor_rating.call_count == 2


@pytest.mark.asyncio
async def test_recalculate_trust_scores_handles_error():
    """Errors on individual contractors are caught and processing continues."""
    contractors = [{"id": "c1"}, {"id": "c2"}]
    db = AsyncMock()
    db.list_contractors = AsyncMock(return_value=(contractors, 2))
    db.update_contractor_rating = AsyncMock(side_effect=[RuntimeError("fail"), None])

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        await recalculate_trust_scores()

    assert db.update_contractor_rating.call_count == 2


# ---------------------------------------------------------------------------
# cleanup_stale_conversations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cleanup_stale_conversations_calls_redis():
    """cleanup_stale_conversations calls get_redis_client (TTL handled by Redis)."""
    mock_redis = AsyncMock()

    with patch("src.workers.scheduler.get_redis_client", return_value=mock_redis):
        await cleanup_stale_conversations()  # should not raise


# ---------------------------------------------------------------------------
# generate_daily_analytics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_daily_analytics_success():
    """generate_daily_analytics writes summary to Redis."""
    db = AsyncMock()
    db.list_offers = AsyncMock(return_value=([], 5))
    db.list_contractors = AsyncMock(return_value=([], 10))

    redis = AsyncMock()
    redis.set = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.workers.scheduler.get_redis_client", return_value=redis):
            await generate_daily_analytics()

    redis.set.assert_called_once()
    args = redis.set.call_args
    assert "analytics:daily_summary" in args[0][0]


@pytest.mark.asyncio
async def test_generate_daily_analytics_handles_db_error():
    """DB errors in generate_daily_analytics are caught and logged."""
    db = AsyncMock()
    db.list_offers = AsyncMock(side_effect=RuntimeError("db down"))

    redis = AsyncMock()

    with patch("src.workers.scheduler.get_postgres_client", return_value=db):
        with patch("src.workers.scheduler.get_redis_client", return_value=redis):
            await generate_daily_analytics()  # should not raise

    redis.set.assert_not_called()


# ---------------------------------------------------------------------------
# run_scheduler entry point
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_scheduler_delegates_to_start():
    """run_scheduler calls scheduler.start()."""
    from src.workers.scheduler import run_scheduler

    with patch("src.workers.scheduler.scheduler") as mock_sched:
        mock_sched.start = AsyncMock()
        await run_scheduler()
        mock_sched.start.assert_called_once()
