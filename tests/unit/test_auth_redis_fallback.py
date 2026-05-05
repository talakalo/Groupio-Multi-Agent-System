"""Regression tests for auth Redis cache fallback (Task 1.4).

Verifies that when Redis is unavailable, get_current_user() still resolves
a valid user from the database — auth must never hard-fail due to Redis being down.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_jwt_payload(user_id: str = "user-abc") -> MagicMock:
    payload = MagicMock()
    payload.sub = user_id
    payload.role = MagicMock()
    payload.role.value = "resident"
    return payload


def _make_db_user(user_id: str = "user-abc") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.email = "test@example.com"
    user.is_active = True
    user.model_dump_json.return_value = '{"id": "user-abc"}'
    return user


@pytest.mark.asyncio
async def test_cached_user_returns_none_on_redis_connection_error() -> None:
    """_get_cached_user must return None (not raise) when Redis raises ConnectionError."""
    from src.api.middleware.auth import _get_cached_user

    with patch(
        "src.databases.redis_client.get_redis_client",
        side_effect=ConnectionError("Redis is down"),
    ):
        result = await _get_cached_user("user-abc")

    assert result is None


@pytest.mark.asyncio
async def test_cached_user_returns_none_on_redis_timeout() -> None:
    """_get_cached_user must return None on any Redis exception, not propagate it."""
    from src.api.middleware.auth import _get_cached_user

    mock_redis = AsyncMock()
    mock_redis.get.side_effect = TimeoutError("Redis timeout")

    with patch("src.databases.redis_client.get_redis_client", return_value=mock_redis):
        result = await _get_cached_user("user-abc")

    assert result is None


@pytest.mark.asyncio
async def test_set_cached_user_swallows_redis_error() -> None:
    """_set_cached_user must not raise even when Redis write fails."""
    from src.api.middleware.auth import _set_cached_user

    mock_redis = AsyncMock()
    mock_redis.set.side_effect = ConnectionError("Redis is down")

    user = _make_db_user()

    with patch("src.databases.redis_client.get_redis_client", return_value=mock_redis):
        await _set_cached_user(user)  # must not raise


@pytest.mark.asyncio
async def test_auth_falls_back_to_db_when_redis_down() -> None:
    """When Redis raises ConnectionError, get_current_user falls back to DB lookup."""
    from src.api.middleware.auth import get_current_user

    payload = _make_jwt_payload("user-abc")
    db_user = _make_db_user("user-abc")

    mock_db = AsyncMock()
    mock_db.get_user.return_value = db_user

    with (
        patch("src.api.middleware.auth.verify_access_token", return_value=payload),
        patch(
            "src.databases.redis_client.get_redis_client",
            side_effect=ConnectionError("Redis down"),
        ),
        patch("src.databases.postgres.get_postgres_client", return_value=mock_db),
    ):
        result = await get_current_user(token="valid.token.here")

    assert result is not None
    mock_db.get_user.assert_called_once_with("user-abc")
