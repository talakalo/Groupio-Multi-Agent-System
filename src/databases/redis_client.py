"""Redis client for caching, state management, and conversation memory."""

import json
import logging
from typing import Any

import redis.asyncio as redis
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config.settings import get_settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Redis client for caching, conversation memory, and rate limiting."""

    def __init__(self) -> None:
        settings = get_settings()
        self._redis = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        self._context_window = 10
        self._conversation_ttl = 86400  # 24 hours

    async def close(self) -> None:
        """Close the Redis connection."""
        await self._redis.close()

    # -- Conversation Memory --

    async def get_conversation_context(self, user_id: str) -> list[dict[str, Any]]:
        """Get recent conversation history for a user."""
        key = f"conv:{user_id}"
        messages = await self._redis.lrange(key, 0, self._context_window - 1)
        return [json.loads(msg) for msg in messages]

    async def add_conversation_message(self, user_id: str, message: dict[str, Any]) -> None:
        """Add a message to conversation history."""
        key = f"conv:{user_id}"
        await self._redis.lpush(key, json.dumps(message, default=str))
        await self._redis.ltrim(key, 0, self._context_window - 1)
        await self._redis.expire(key, self._conversation_ttl)

    async def clear_conversation(self, user_id: str) -> None:
        """Clear conversation history for a user."""
        await self._redis.delete(f"conv:{user_id}")

    # -- Caching --

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
    )
    async def cache_get(self, key: str) -> Any | None:
        """Get a cached value."""
        value = await self._redis.get(f"cache:{key}")
        return json.loads(value) if value else None

    async def cache_set(self, key: str, value: Any, ttl: int = 3600) -> None:
        """Set a cached value with TTL."""
        await self._redis.set(
            f"cache:{key}",
            json.dumps(value, default=str),
            ex=ttl,
        )

    async def cache_delete(self, key: str) -> None:
        """Delete a cached value."""
        await self._redis.delete(f"cache:{key}")

    # -- Rate Limiting --

    async def check_rate_limit(self, user_id: str, limit: int = 60, window: int = 60) -> bool:
        """Check if a user has exceeded their rate limit.

        Returns True if the request is allowed, False if rate limited.
        """
        key = f"rate:{user_id}"
        current = await self._redis.get(key)

        if current is None:
            await self._redis.set(key, 1, ex=window)
            return True

        if int(current) >= limit:
            return False

        await self._redis.incr(key)
        return True

    # -- A/B Testing --

    async def ab_test_track(
        self,
        campaign_id: str,
        variant: str,
        outcome: str,
    ) -> None:
        """Track an A/B test conversion."""
        key = f"ab_test:{campaign_id}:{variant}"
        await self._redis.hincrby(key, outcome, 1)

    async def ab_test_get_results(self, campaign_id: str, variant: str) -> dict[str, int]:
        """Get A/B test results for a variant."""
        key = f"ab_test:{campaign_id}:{variant}"
        results = await self._redis.hgetall(key)
        return {k: int(v) for k, v in results.items()}

    # -- Agent State --

    async def save_agent_state(
        self, conversation_id: str, state: dict[str, Any], ttl: int = 3600
    ) -> None:
        """Save agent state for a conversation."""
        key = f"agent_state:{conversation_id}"
        await self._redis.set(
            key,
            json.dumps(state, default=str),
            ex=ttl,
        )

    async def get_agent_state(self, conversation_id: str) -> dict[str, Any] | None:
        """Get agent state for a conversation."""
        key = f"agent_state:{conversation_id}"
        value = await self._redis.get(key)
        return json.loads(value) if value else None

    # -- Raw key-value (for auth tokens, etc.) --

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        """Set a key-value pair with optional TTL."""
        if ex is not None:
            await self._redis.set(key, value, ex=ex)
        else:
            await self._redis.set(key, value)

    async def get(self, key: str) -> str | None:
        """Get a value by key."""
        return await self._redis.get(key)

    async def delete(self, key: str) -> None:
        """Delete a key."""
        await self._redis.delete(key)

    # -- Health --

    async def health_check(self) -> bool:
        """Check if Redis is accessible."""
        try:
            await self._redis.ping()
            return True
        except Exception:
            logger.exception("Redis health check failed")
            return False


_redis_client: RedisClient | None = None


def get_redis_client() -> RedisClient:
    """Get or create the singleton RedisClient instance."""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    return _redis_client
