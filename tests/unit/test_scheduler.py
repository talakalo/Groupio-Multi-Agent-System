"""Unit tests for the TaskScheduler and ScheduledTask."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from src.workers.scheduler import ScheduledTask, TaskScheduler

# ------------------------------------------------------------------
# Fixtures
# ------------------------------------------------------------------


@pytest.fixture
def scheduler():
    """Fresh TaskScheduler instance (isolated from the module-level singleton)."""
    return TaskScheduler()


@pytest.fixture
def mock_store():
    """Mock PostgresStore for scheduler lock tests."""
    s = AsyncMock()
    s.get_scheduler_last_run = AsyncMock(return_value=None)
    s.acquire_scheduler_lock = AsyncMock(return_value=True)
    s.release_scheduler_lock = AsyncMock()
    return s


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------


def test_register_task(scheduler):
    """register() decorator adds a ScheduledTask to scheduler.tasks."""

    @scheduler.register("my_task", interval_seconds=60)
    async def my_task():
        pass

    assert len(scheduler.tasks) == 1
    assert scheduler.tasks[0].name == "my_task"
    assert scheduler.tasks[0].interval_seconds == 60
    assert scheduler.tasks[0].func is my_task


def test_scheduled_task_properties():
    """ScheduledTask initialises with correct attrs and last_run=None."""

    async def noop():
        pass

    task = ScheduledTask("test_task", 300, noop)

    assert task.name == "test_task"
    assert task.interval_seconds == 300
    assert task.func is noop
    assert task.last_run is None


# ------------------------------------------------------------------
# _try_run_task
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_try_run_task_skips_if_too_recent(scheduler, mock_store):
    """If Postgres reports a recent last_run, the task is NOT executed."""
    recent = datetime.now(UTC) - timedelta(seconds=5)
    mock_store.get_scheduler_last_run = AsyncMock(return_value=recent)

    func = AsyncMock()
    task = ScheduledTask("check", interval_seconds=3600, func=func)

    with patch("src.databases.pg_store.get_pg_store", return_value=mock_store):
        await scheduler._try_run_task(task)

    func.assert_not_called()


@pytest.mark.asyncio
async def test_try_run_task_runs_if_due(scheduler, mock_store):
    """If no last_run recorded and lock acquired, the task function is called."""
    mock_store.get_scheduler_last_run = AsyncMock(return_value=None)  # No last_run
    mock_store.acquire_scheduler_lock = AsyncMock(return_value=True)  # Lock acquired

    func = AsyncMock()
    task = ScheduledTask("check", interval_seconds=3600, func=func)

    with patch("src.databases.pg_store.get_pg_store", return_value=mock_store):
        await scheduler._try_run_task(task)

    func.assert_called_once()
    # Verify lock was released in finally block
    mock_store.release_scheduler_lock.assert_called_once_with("check")


@pytest.mark.asyncio
async def test_try_run_task_skips_if_locked(scheduler, mock_store):
    """If another worker holds the lock (acquire returns False), skip."""
    mock_store.get_scheduler_last_run = AsyncMock(return_value=None)  # No last_run → eligible
    mock_store.acquire_scheduler_lock = AsyncMock(return_value=False)  # Lock NOT acquired

    func = AsyncMock()
    task = ScheduledTask("check", interval_seconds=3600, func=func)

    with patch("src.databases.pg_store.get_pg_store", return_value=mock_store):
        await scheduler._try_run_task(task)

    func.assert_not_called()


# ------------------------------------------------------------------
# stop
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_sets_running_false(scheduler):
    """scheduler.stop() sets _running to False."""
    scheduler._running = True
    await scheduler.stop()
    assert scheduler._running is False
