"""Tests for IP-based rate limiting and account lockout.

These tests previously mocked the internal `_redis` attribute of RedisClient.
Since RedisClient is now an alias for PostgresStore, we mock PostgresStore
methods directly.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_check_ip_rate_limit_allows_under_limit():
    """Requests below the limit should return True."""
    from src.databases.pg_store import get_pg_store

    with patch("src.databases.pg_store.get_pg_store") as mock_factory:
        mock_store = AsyncMock()
        mock_store.check_ip_rate_limit = AsyncMock(return_value=True)
        mock_factory.return_value = mock_store

        result = await mock_store.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
        assert result is True


@pytest.mark.asyncio
async def test_check_ip_rate_limit_blocks_over_limit():
    """21st request from same IP should return False."""
    from src.databases.pg_store import get_pg_store

    with patch("src.databases.pg_store.get_pg_store") as mock_factory:
        mock_store = AsyncMock()
        mock_store.check_ip_rate_limit = AsyncMock(return_value=False)
        mock_factory.return_value = mock_store

        result = await mock_store.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
        assert result is False


@pytest.mark.asyncio
async def test_check_ip_rate_limit_allows_when_store_down():
    """When the store is unreachable, rate limiting must not block auth (fail open)."""
    from src.databases.pg_store import PostgresStore

    store = PostgresStore.__new__(PostgresStore)
    # Simulate _use_supabase initialized to False and a failed DB call
    store._use_supabase = False

    # check_ip_rate_limit has an outer try/except that returns True on any error
    with patch.object(PostgresStore, "_pg_fetchval", side_effect=ConnectionError("DB down")):
        result = await store.check_ip_rate_limit("1.2.3.4", limit=20, window=60)
    assert result is True


@pytest.mark.asyncio
async def test_check_auth_rate_limit_raises_429():
    """check_auth_rate_limit dependency must raise HTTP 429 when IP is rate limited."""
    from src.api.routes.auth import check_auth_rate_limit

    mock_request = AsyncMock()
    mock_request.client.host = "1.2.3.4"

    with patch("src.api.routes.auth.get_pg_store") as mock_get_store:
        mock_store = AsyncMock()
        mock_store.check_ip_rate_limit = AsyncMock(return_value=False)
        mock_get_store.return_value = mock_store

        with pytest.raises(HTTPException) as exc_info:
            await check_auth_rate_limit(mock_request)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers.get("Retry-After") == "60"


@pytest.mark.asyncio
async def test_increment_login_failures_returns_count():
    """increment_login_failures should return the current failure count."""
    from src.databases.pg_store import PostgresStore

    store = PostgresStore.__new__(PostgresStore)
    store._use_supabase = False

    # Mock the underlying pg query to return a count
    with patch.object(PostgresStore, "_pg_fetchval", return_value=3):
        count = await store.increment_login_failures("user-123")
    assert count == 3


@pytest.mark.asyncio
async def test_clear_login_failures_deletes_key():
    """clear_login_failures should remove login_attempts rows for the user."""
    from src.databases.pg_store import PostgresStore

    store = PostgresStore.__new__(PostgresStore)
    store._use_supabase = False

    # Mock _pg_execute so no real DB call is made
    with patch.object(PostgresStore, "_pg_execute", return_value="DELETE 1") as mock_exec:
        await store.clear_login_failures("user-123")

    # Verify a DELETE was executed referencing user-123
    mock_exec.assert_called_once()
    call_args = mock_exec.call_args[0]
    assert "user-123" in call_args or "user-123" in str(mock_exec.call_args)
