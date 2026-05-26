"""Tests for IP-based rate limiting and account lockout (Task 1.3 / Task 2.9)."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_check_ip_rate_limit_allows_under_limit():
    """Requests below the limit should return True."""
    from src.databases.redis_client import RedisClient

    client = RedisClient.__new__(RedisClient)
    client._redis = AsyncMock()
    client._redis.eval = AsyncMock(return_value=5)

    result = await client.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is True


@pytest.mark.asyncio
async def test_check_ip_rate_limit_blocks_over_limit():
    """21st request from same IP should return False."""
    from src.databases.redis_client import RedisClient

    client = RedisClient.__new__(RedisClient)
    client._redis = AsyncMock()
    client._redis.eval = AsyncMock(return_value=21)

    result = await client.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is False


@pytest.mark.asyncio
async def test_check_ip_rate_limit_allows_when_redis_down():
    """When Redis is unreachable, rate limiting must not block auth (fail open)."""
    from src.databases.redis_client import RedisClient

    client = RedisClient.__new__(RedisClient)
    client._redis = AsyncMock()
    client._redis.eval = AsyncMock(side_effect=ConnectionError("Redis is down"))

    result = await client.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is True


@pytest.mark.asyncio
async def test_check_auth_rate_limit_raises_429():
    """check_auth_rate_limit dependency must raise HTTP 429 when IP is rate limited."""
    from src.api.routes.auth import check_auth_rate_limit

    mock_request = AsyncMock()
    mock_request.client.host = "1.2.3.4"

    with patch("src.api.routes.auth.get_redis_client") as mock_get_redis:
        mock_redis = AsyncMock()
        mock_redis.check_ip_rate_limit = AsyncMock(return_value=False)
        mock_get_redis.return_value = mock_redis

        with pytest.raises(HTTPException) as exc_info:
            await check_auth_rate_limit(mock_request)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers.get("Retry-After") == "60"


@pytest.mark.asyncio
async def test_increment_login_failures_returns_count():
    from src.databases.redis_client import RedisClient

    client = RedisClient.__new__(RedisClient)
    client._redis = AsyncMock()
    client._redis.eval = AsyncMock(return_value=3)

    count = await client.increment_login_failures("user-123")
    assert count == 3


@pytest.mark.asyncio
async def test_clear_login_failures_deletes_key():
    from src.databases.redis_client import RedisClient

    client = RedisClient.__new__(RedisClient)
    client._redis = AsyncMock()
    client._redis.delete = AsyncMock()

    await client.clear_login_failures("user-123")
    client._redis.delete.assert_called_once_with("login_fail:user-123")
