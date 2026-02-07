"""
Background worker for processing agent tasks.

This worker polls Redis for incoming tasks and dispatches them
to the appropriate agent for processing.
"""

import asyncio
import json
import signal
import sys
from typing import Any

import redis.asyncio as redis
import structlog

from src.config.settings import settings
from src.agents.router import RouterAgent

logger = structlog.get_logger(__name__)


class AgentWorker:
    """Background worker that processes agent tasks from Redis queue."""

    def __init__(self):
        self.redis_client: redis.Redis | None = None
        self.router_agent: RouterAgent | None = None
        self.running = False
        self.task_queue = "groupio:agent:tasks"
        self.result_queue = "groupio:agent:results"

    async def connect(self):
        """Connect to Redis and initialize agents."""
        logger.info("Connecting to Redis", url=settings.REDIS_URL)
        self.redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )

        # Test connection
        await self.redis_client.ping()
        logger.info("Connected to Redis successfully")

        # Initialize router agent
        self.router_agent = RouterAgent()
        logger.info("Router agent initialized")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Disconnected from Redis")

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

            result = await self.router_agent.run(
                message=message,
                user_id=user_id,
                session_id=session_id,
                context=context,
            )

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
        logger.info("Agent worker starting", queue=self.task_queue)

        while self.running:
            try:
                # Block for up to 5 seconds waiting for a task
                result = await self.redis_client.brpop(self.task_queue, timeout=5)

                if result is None:
                    # No task received, continue polling
                    continue

                _, task_json = result
                task_data = json.loads(task_json)

                # Process the task
                result = await self.process_task(task_data)

                # Push result to results queue
                task_id = task_data.get("task_id")
                if task_id:
                    result_key = f"{self.result_queue}:{task_id}"
                    await self.redis_client.setex(
                        result_key,
                        300,  # 5 minute TTL
                        json.dumps(result),
                    )

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
