"""Unit tests for AgentWorker."""

import asyncio
from unittest.mock import AsyncMock, patch

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
# AgentWorker.run (main loop) — now uses asyncio.Queue (not Redis brpop)
# ---------------------------------------------------------------------------


class TestWorkerRun:
    @pytest.mark.asyncio
    async def test_run_processes_one_task_then_stops(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()
        worker.router_agent.run = AsyncMock(return_value={"response": "ok"})

        task = {"task_id": "t1", "message": "hello", "user_id": "u1"}

        # Pre-populate the queue with one task
        await worker._queue.put(task)

        # Stop after one iteration by marking running=False after the first dequeue
        original_process = worker.process_task

        call_count = 0

        async def fake_process(task_data):
            nonlocal call_count
            call_count += 1
            result = await original_process(task_data)
            worker.running = False
            return result

        worker.process_task = fake_process

        await worker.run()

        assert call_count == 1

    @pytest.mark.asyncio
    async def test_run_handles_general_exception(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        call_count = 0

        async def fake_process(task_data):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("process error")
            worker.running = False
            return {"status": "ok"}

        worker.process_task = fake_process

        # Put two tasks so we hit the error and then the stop
        await worker._queue.put({"task_id": "t1", "message": "hello"})
        await worker._queue.put({"task_id": "t2", "message": "world"})

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await worker.run()  # should not raise

    @pytest.mark.asyncio
    async def test_run_cancelled_error_stops_loop(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        async def fake_process(task_data):
            raise asyncio.CancelledError()

        worker.process_task = fake_process

        await worker._queue.put({"task_id": "t1", "message": "hello"})

        await worker.run()  # should exit loop cleanly

    @pytest.mark.asyncio
    async def test_run_timeout_then_stop(self):
        """Worker exits cleanly when queue is empty and running is set to False."""
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.router_agent = AsyncMock()

        # Stop after the first timeout
        async def stop_after_timeout(*args, **kwargs):
            worker.running = False
            raise TimeoutError()

        with patch("asyncio.wait_for", side_effect=stop_after_timeout):
            await worker.run()  # should exit cleanly


# ---------------------------------------------------------------------------
# AgentWorker.connect / disconnect / enqueue
# ---------------------------------------------------------------------------


class TestConnectDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_is_noop(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        await worker.disconnect()  # should not raise

    def test_stop_sets_running_false(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        worker.running = True
        worker.stop()
        assert worker.running is False

    @pytest.mark.asyncio
    async def test_enqueue_adds_to_queue(self):
        from src.workers.agent_worker import AgentWorker

        worker = AgentWorker()
        task = {"task_id": "t1", "message": "hello"}
        await worker.enqueue(task)
        assert worker._queue.qsize() == 1
        retrieved = await worker._queue.get()
        assert retrieved == task
