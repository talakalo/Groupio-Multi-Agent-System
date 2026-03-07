"""Unit tests for AgentWorker."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.workers.agent_worker import AgentWorker


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def worker():
    return AgentWorker()


@pytest.fixture
def mock_redis():
    r = AsyncMock()
    r.ping = AsyncMock()
    r.close = AsyncMock()
    return r


@pytest.fixture
def mock_router_agent():
    agent = AsyncMock()
    agent.run = AsyncMock(return_value={"response": "handled"})
    return agent


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------


def test_worker_initial_state(worker):
    assert worker.running is False
    assert worker.redis_client is None
    assert worker.router_agent is None
    assert worker.task_queue == "groupio:agent:tasks"
    assert worker.result_queue == "groupio:agent:results"


# ---------------------------------------------------------------------------
# connect / disconnect
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connect(worker, mock_redis):
    with patch("src.workers.agent_worker.redis") as mock_redis_module:
        mock_redis_module.from_url = MagicMock(return_value=mock_redis)
        with patch("src.workers.agent_worker.RouterAgent") as mock_agent_cls:
            mock_agent_cls.return_value = MagicMock()
            await worker.connect()

    assert worker.redis_client is not None
    assert worker.router_agent is not None
    mock_redis.ping.assert_awaited_once()


@pytest.mark.asyncio
async def test_disconnect_with_client(worker, mock_redis):
    worker.redis_client = mock_redis
    await worker.disconnect()
    mock_redis.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_disconnect_without_client(worker):
    # Should not raise
    await worker.disconnect()


# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------


def test_stop_sets_running_false(worker):
    worker.running = True
    worker.stop()
    assert worker.running is False


# ---------------------------------------------------------------------------
# process_task
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_task_success(worker, mock_router_agent):
    worker.router_agent = mock_router_agent
    task_data = {
        "task_id": "task-1",
        "message": "Hello",
        "user_id": "user-1",
        "session_id": "sess-1",
        "context": {},
    }
    result = await worker.process_task(task_data)
    assert result["task_id"] == "task-1"
    assert result["status"] == "success"
    assert "result" in result


@pytest.mark.asyncio
async def test_process_task_no_router_agent(worker):
    worker.router_agent = None
    task_data = {"task_id": "task-2", "message": "Hello"}
    result = await worker.process_task(task_data)
    assert result["status"] == "error"
    assert "error" in result


@pytest.mark.asyncio
async def test_process_task_agent_exception(worker, mock_router_agent):
    mock_router_agent.run = AsyncMock(side_effect=ValueError("bad input"))
    worker.router_agent = mock_router_agent
    task_data = {"task_id": "task-3", "message": "crash"}
    result = await worker.process_task(task_data)
    assert result["status"] == "error"
    assert "bad input" in result["error"]


@pytest.mark.asyncio
async def test_process_task_missing_task_id(worker, mock_router_agent):
    worker.router_agent = mock_router_agent
    task_data = {"message": "no task id"}
    result = await worker.process_task(task_data)
    assert result["task_id"] == "unknown"
    assert result["status"] == "success"


# ---------------------------------------------------------------------------
# run — single-iteration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_processes_task_and_stops(worker, mock_redis, mock_router_agent):
    """Worker processes one task and then stops (running=False stops loop)."""
    task = {"task_id": "t1", "message": "hello", "user_id": "u1"}
    mock_redis.brpop = AsyncMock(side_effect=[("queue", json.dumps(task)), None])
    mock_redis.setex = AsyncMock()
    worker.redis_client = mock_redis
    worker.router_agent = mock_router_agent

    # Stop after first None (no task)
    iteration = 0

    async def brpop_side_effect(*args, **kwargs):
        nonlocal iteration
        iteration += 1
        if iteration == 1:
            return ("queue", json.dumps(task))
        worker.stop()
        return None

    mock_redis.brpop = AsyncMock(side_effect=brpop_side_effect)
    await worker.run()
    mock_redis.setex.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_handles_json_decode_error(worker, mock_redis, mock_router_agent):
    """Bad JSON is logged and loop continues until stopped."""
    worker.redis_client = mock_redis
    worker.router_agent = mock_router_agent

    iteration = 0

    async def brpop_side_effect(*args, **kwargs):
        nonlocal iteration
        iteration += 1
        if iteration == 1:
            return ("queue", "not valid json {{{")
        worker.stop()
        return None

    mock_redis.brpop = AsyncMock(side_effect=brpop_side_effect)
    # Should not raise
    await worker.run()


@pytest.mark.asyncio
async def test_run_handles_no_task(worker, mock_redis, mock_router_agent):
    """None result from brpop is handled gracefully."""
    worker.redis_client = mock_redis
    worker.router_agent = mock_router_agent

    iteration = 0

    async def brpop_side_effect(*args, **kwargs):
        nonlocal iteration
        iteration += 1
        if iteration >= 2:
            worker.stop()
        return None

    mock_redis.brpop = AsyncMock(side_effect=brpop_side_effect)
    await worker.run()
