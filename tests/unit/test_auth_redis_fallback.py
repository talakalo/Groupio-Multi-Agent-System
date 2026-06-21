"""Tests for auth middleware fallback behavior (updated: Redis removed, pg_store used).

The Redis user cache (_get_cached_user/_set_cached_user) was removed in plan 00-03.
User lookups now go directly to the database on every request.

These tests verify:
1. invalidate_cached_user is a no-op (doesn't raise)
2. get_current_user still resolves user from DB regardless of pg_store availability
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_jwt_payload(user_id: str = "user-abc") -> MagicMock:
    payload = MagicMock()
    payload.sub = user_id
    payload.jti = "jti-abc"
    payload.role = MagicMock()
    payload.role.value = "resident"
    return payload


def _make_db_user(user_id: str = "user-abc") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.email = "test@example.com"
    user.is_active = True
    user.is_verified = True
    return user


@pytest.mark.asyncio
async def test_cached_user_returns_none_on_redis_connection_error() -> None:
    """invalidate_cached_user is a no-op — user cache removed (Redis eliminated)."""
    from src.api.middleware.auth import invalidate_cached_user

    # Should not raise regardless of input
    await invalidate_cached_user("user-abc")


@pytest.mark.asyncio
async def test_cached_user_returns_none_on_redis_timeout() -> None:
    """invalidate_cached_user is a no-op — always succeeds, never times out."""
    from src.api.middleware.auth import invalidate_cached_user

    # Calling with any user_id is always safe
    result = await invalidate_cached_user("user-abc")
    assert result is None


@pytest.mark.asyncio
async def test_set_cached_user_swallows_redis_error() -> None:
    """invalidate_cached_user is a no-op — no Redis write to fail."""
    from src.api.middleware.auth import invalidate_cached_user

    # Must not raise even if called many times
    await invalidate_cached_user("user-abc")
    await invalidate_cached_user("user-xyz")


@pytest.mark.asyncio
async def test_auth_falls_back_to_db_when_redis_down() -> None:
    """get_current_user resolves user from DB; pg_store denylist check fails-open."""
    from src.api.middleware.auth import get_current_user

    payload = _make_jwt_payload("user-abc")
    db_user = _make_db_user("user-abc")

    mock_db = AsyncMock()
    mock_db.get_user.return_value = db_user

    mock_store = AsyncMock()
    mock_store.is_token_denylisted = AsyncMock(side_effect=ConnectionError("DB error"))

    with (
        patch("src.api.middleware.auth.verify_access_token", return_value=payload),
        patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
        patch("src.databases.pg_store.get_pg_store", return_value=mock_store),
    ):
        result = await get_current_user(token="valid.token.here")

    assert result is not None
    mock_db.get_user.assert_called_once_with("user-abc")
