"""Extended unit tests for RedisClient."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.databases.redis_client import RedisClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis_conn():
    return AsyncMock()


@pytest.fixture
def client(mock_redis_conn):
    mock_settings = MagicMock()
    mock_settings.REDIS_URL = "redis://localhost:6379"
    mock_settings.REDIS_PASSWORD = None
    with patch("src.databases.redis_client.get_settings", return_value=mock_settings):
        with patch("src.databases.redis_client.redis") as mock_redis_module:
            mock_redis_module.from_url = MagicMock(return_value=mock_redis_conn)
            c = RedisClient()
    return c, mock_redis_conn


@pytest.fixture
def client_with_password(mock_redis_conn):
    mock_settings = MagicMock()
    mock_settings.REDIS_URL = "redis://localhost:6379"
    mock_settings.REDIS_PASSWORD = "secret"
    with patch("src.databases.redis_client.get_settings", return_value=mock_settings):
        with patch("src.databases.redis_client.redis") as mock_redis_module:
            mock_redis_module.from_url = MagicMock(return_value=mock_redis_conn)
            c = RedisClient()
    return c, mock_redis_conn


# ---------------------------------------------------------------------------
# Conversation memory
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_conversation_context(client):
    c, conn = client
    msg = {"role": "user", "content": "hello"}
    conn.lrange = AsyncMock(return_value=[json.dumps(msg)])

    result = await c.get_conversation_context("user-1")
    assert len(result) == 1
    assert result[0]["role"] == "user"


@pytest.mark.asyncio
async def test_add_conversation_message(client):
    c, conn = client
    conn.lpush = AsyncMock()
    conn.ltrim = AsyncMock()
    conn.expire = AsyncMock()

    await c.add_conversation_message("user-1", {"role": "assistant", "content": "hi"})
    conn.lpush.assert_awaited_once()
    conn.ltrim.assert_awaited_once()
    conn.expire.assert_awaited_once()


@pytest.mark.asyncio
async def test_clear_conversation(client):
    c, conn = client
    conn.delete = AsyncMock()
    await c.clear_conversation("user-1")
    conn.delete.assert_awaited_once_with("conv:user-1")


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cache_get_hit(client):
    c, conn = client
    conn.get = AsyncMock(return_value=json.dumps({"key": "value"}))
    result = await c.cache_get("mykey")
    assert result == {"key": "value"}


@pytest.mark.asyncio
async def test_cache_get_miss(client):
    c, conn = client
    conn.get = AsyncMock(return_value=None)
    result = await c.cache_get("missing")
    assert result is None


@pytest.mark.asyncio
async def test_cache_set(client):
    c, conn = client
    conn.set = AsyncMock()
    await c.cache_set("mykey", {"data": 1}, ttl=600)
    conn.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_cache_delete(client):
    c, conn = client
    conn.delete = AsyncMock()
    await c.cache_delete("mykey")
    conn.delete.assert_awaited_once_with("cache:mykey")


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_rate_limit_allowed(client):
    c, conn = client
    conn.eval = AsyncMock(return_value=5)
    result = await c.check_rate_limit("user-1", limit=60, window=60)
    assert result is True


@pytest.mark.asyncio
async def test_check_rate_limit_exceeded(client):
    c, conn = client
    conn.eval = AsyncMock(return_value=61)
    result = await c.check_rate_limit("user-1", limit=60, window=60)
    assert result is False


@pytest.mark.asyncio
async def test_check_ip_rate_limit_allowed(client):
    c, conn = client
    conn.eval = AsyncMock(return_value=10)
    result = await c.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is True


@pytest.mark.asyncio
async def test_check_ip_rate_limit_exceeded(client):
    c, conn = client
    conn.eval = AsyncMock(return_value=21)
    result = await c.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is False


@pytest.mark.asyncio
async def test_increment_login_failures(client):
    c, conn = client
    conn.eval = AsyncMock(return_value=3)
    count = await c.increment_login_failures("user-1")
    assert count == 3


@pytest.mark.asyncio
async def test_clear_login_failures(client):
    c, conn = client
    conn.delete = AsyncMock()
    await c.clear_login_failures("user-1")
    conn.delete.assert_awaited_once_with("login_fail:user-1")


# ---------------------------------------------------------------------------
# A/B testing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ab_test_track(client):
    c, conn = client
    conn.hincrby = AsyncMock()
    await c.ab_test_track("campaign-1", "variant_a", "click")
    conn.hincrby.assert_awaited_once()


@pytest.mark.asyncio
async def test_ab_test_get_results(client):
    c, conn = client
    conn.hgetall = AsyncMock(return_value={"click": "5", "view": "20"})
    result = await c.ab_test_get_results("campaign-1", "variant_a")
    assert result == {"click": 5, "view": 20}


# ---------------------------------------------------------------------------
# Agent state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_agent_state(client):
    c, conn = client
    conn.set = AsyncMock()
    await c.save_agent_state("conv-1", {"intent": "support"}, ttl=3600)
    conn.set.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_agent_state_found(client):
    c, conn = client
    state = {"intent": "support"}
    conn.get = AsyncMock(return_value=json.dumps(state))
    result = await c.get_agent_state("conv-1")
    assert result == state


@pytest.mark.asyncio
async def test_get_agent_state_not_found(client):
    c, conn = client
    conn.get = AsyncMock(return_value=None)
    result = await c.get_agent_state("conv-1")
    assert result is None


# ---------------------------------------------------------------------------
# Raw key-value
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_with_ttl(client):
    c, conn = client
    conn.set = AsyncMock(return_value=True)
    result = await c.set("mykey", "myval", ex=300)
    assert result is True


@pytest.mark.asyncio
async def test_set_nx_false_when_key_exists(client):
    c, conn = client
    conn.set = AsyncMock(return_value=None)
    result = await c.set("existing_key", "val", nx=True)
    assert result is False


@pytest.mark.asyncio
async def test_get_key(client):
    c, conn = client
    conn.get = AsyncMock(return_value="myvalue")
    result = await c.get("mykey")
    assert result == "myvalue"


@pytest.mark.asyncio
async def test_delete_key(client):
    c, conn = client
    conn.delete = AsyncMock()
    await c.delete("mykey")
    conn.delete.assert_awaited_once_with("mykey")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_check_success(client):
    c, conn = client
    conn.ping = AsyncMock()
    assert await c.health_check() is True


@pytest.mark.asyncio
async def test_health_check_failure(client):
    c, conn = client
    conn.ping = AsyncMock(side_effect=Exception("connection refused"))
    assert await c.health_check() is False


# ---------------------------------------------------------------------------
# close
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close(client):
    c, conn = client
    conn.close = AsyncMock()
    await c.close()
    conn.close.assert_awaited_once()
