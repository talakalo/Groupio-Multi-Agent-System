"""
Background worker for processing agent tasks.

This worker was originally Redis-backed (brpop queue). Redis has been replaced
with Postgres in phase 00-remove-redis. This worker now uses an in-memory asyncio
queue and can be extended to use RabbitMQ (ENABLE_RABBITMQ=true) when a message
queue is available.

For single-worker Render deployments, tasks are dispatched via direct async calls
rather than via a queue broker.
"""

import asyncio
import json
import signal
import sys
from typing import Any

import structlog

from src.agents.router import RouterAgent
from src.config.settings import get_settings

logger = structlog.get_logger(__name__)

# Get settings instance
settings = get_settings()


class AgentWorker:
    """Background worker that processes agent tasks from an in-memory queue.

    Note: Previously Redis-backed (brpop). Now uses asyncio.Queue internally.
    Extend with RabbitMQ (ENABLE_RABBITMQ=true) for multi-worker fan-out.
    """

    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self.router_agent: RouterAgent | None = None
        self.running = False
        self.task_queue = "groupio:agent:tasks"
        self.result_queue = "groupio:agent:results"

    async def connect(self):
        """Initialize agents (no external queue broker needed in single-worker mode)."""
        logger.info("Agent worker initializing (in-memory queue mode)")

        # Initialize router agent
        self.router_agent = RouterAgent()
        logger.info("Router agent initialized")

    async def disconnect(self):
        """Shutdown — no external connection to close."""
        logger.info("Agent worker disconnected")

    async def enqueue(self, task_data: dict[str, Any]) -> None:
        """Enqueue a task for processing. Called by route handlers directly."""
        await self._queue.put(task_data)

    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        """
        Process a single task using the appropriate agent.

        Args:
            task_data: Task payload containing message and context

        Returns:
            Result from the agent
        """
        task_id = task_data.get("task_id", "unknown")
        message = task_data.get("message", "")
        user_id = task_data.get("user_id")
        session_id = task_data.get("session_id")
        context = task_data.get("context", {})

        logger.info(
            "Processing task",
            task_id=task_id,
            user_id=user_id,
            message_preview=message[:50] if message else "",
        )

        try:
            # Route the message through the router agent
            if self.router_agent is None:
                raise RuntimeError("Router agent not initialized")

            from src.models.agent_state import AgentState

            state: AgentState = {  # type: ignore[typeddict-item]
                "messages": [{"role": "user", "content": message}] if message else [],
                "user_id": user_id or "",
                "building_id": None,
                "conversation_id": session_id or "",
                "current_agent": "router",
                "intent": None,
                "confidence": 0.0,
                "context": context,
                "actions_taken": [],
            }
            result = await self.router_agent.run(state)

            return {
                "task_id": task_id,
                "status": "success",
                "result": result,
            }

        except Exception as e:
            logger.error("Task processing failed", task_id=task_id, error=str(e))
            return {
                "task_id": task_id,
                "status": "error",
                "error": str(e),
            }

    async def run(self):
        """Main worker loop - poll for tasks and process them."""
        self.running = True
        logger.info("Agent worker starting", queue="in-memory asyncio.Queue")

        while self.running:
            try:
                # Wait up to 5 seconds for a task
                try:
                    task_data = await asyncio.wait_for(self._queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    # No task — continue polling
                    continue

                # Process the task
                result = await self.process_task(task_data)
                logger.info("Task complete", task_id=task_data.get("task_id"), status=result.get("status"))

            except asyncio.CancelledError:
                logger.info("Worker cancelled, shutting down")
                break
            except json.JSONDecodeError as e:
                logger.error("Invalid task JSON", error=str(e))
            except Exception as e:
                logger.error("Worker error", error=str(e))
                # Brief pause before retrying
                await asyncio.sleep(1)

        logger.info("Agent worker stopped")

    def stop(self):
        """Signal the worker to stop."""
        self.running = False


async def main():
    """Entry point for the worker."""
    worker = AgentWorker()

    # Set up signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info("Shutdown signal received", signal=sig)
        worker.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        await worker.connect()
        await worker.run()
    finally:
        await worker.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker interrupted")
        sys.exit(0)
