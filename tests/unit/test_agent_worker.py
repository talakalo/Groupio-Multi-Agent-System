"""Unit tests for AgentWorker."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# AgentWorker.process_task
# ---------------------------------------------------------------------------


class TestProcessTask:
    @pytest.mark.asyncio
    async def test_process_task_ok(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()
        worker.router_agent.run = AsyncMock(return_value={"response": "hi"})

        result = await worker.process_task(
            {
                "task_id": "t1",
                "message": "hello",
                "user_id": "u1",
                "session_id": "s1",
                "context": {},
            }
        )

        assert result["status"] == "success"
        assert result["task_id"] == "t1"

    @pytest.mark.asyncio
    async def test_process_task_no_agent(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = None  # not initialized

        result = await worker.process_task({"task_id": "t1", "message": "hello"})

        assert result["status"] == "error"
        assert "not initialized" in result["error"]

    @pytest.mark.asyncio
    async def test_process_task_agent_error(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()
        worker.router_agent.run = AsyncMock(side_effect=RuntimeError("agent boom"))

        result = await worker.process_task({"task_id": "t2", "message": "fail"})

        assert result["status"] == "error"
        assert "agent boom" in result["error"]


# ---------------------------------------------------------------------------
# AgentWorker.run (main loop)
# ---------------------------------------------------------------------------


class TestWorkerRun:
    @pytest.mark.asyncio
    async def test_run_processes_one_task_then_stops(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()
        worker.router_agent.run = AsyncMock(return_value={"response": "ok"})

        mock_redis = AsyncMock()
        task = {"task_id": "t1", "message": "hello", "user_id": "u1"}

        call_count = 0

        async def fake_brpop(queue, timeout):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("queue", json.dumps(task))
            worker.running = False
            return None

        mock_redis.brpop = fake_brpop
        mock_redis.setex = AsyncMock()
        worker.redis_client = mock_redis

        await worker.run()

        mock_redis.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_handles_json_error(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        mock_redis = AsyncMock()
        call_count = 0

        async def fake_brpop(queue, timeout):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return ("queue", "not-valid-json{{{")
            worker.running = False
            return None

        mock_redis.brpop = fake_brpop
        worker.redis_client = mock_redis

        await worker.run()  # should not raise

    @pytest.mark.asyncio
    async def test_run_handles_general_exception(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        mock_redis = AsyncMock()
        call_count = 0

        async def fake_brpop(queue, timeout):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("redis error")
            worker.running = False
            return None

        mock_redis.brpop = fake_brpop
        worker.redis_client = mock_redis

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await worker.run()  # should not raise

    @pytest.mark.asyncio
    async def test_run_cancelled_error_stops_loop(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        mock_redis = AsyncMock()

        async def fake_brpop(queue, timeout):
            raise asyncio.CancelledError()

        mock_redis.brpop = fake_brpop
        worker.redis_client = mock_redis

        await worker.run()  # should exit loop cleanly


# ---------------------------------------------------------------------------
# AgentWorker.connect / disconnect
# ---------------------------------------------------------------------------


class TestConnectDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_skips_if_no_redis(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.redis_client = None
        await worker.disconnect()  # should not raise

    def test_stop_sets_running_false(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.running = True
        worker.stop()
        assert worker.running is False
