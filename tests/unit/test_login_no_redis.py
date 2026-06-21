"""Tests confirming POST /api/v1/auth/login/json returns 401 (not 500) without Redis.

These tests verify the critical fix: before plan 00-03, login_json made an unguarded
Redis call (is_temporarily_locked) after a successful DB lookup. When Redis was
unavailable (e.g. on Render), this caused a redis.exceptions.ConnectionError to
propagate as HTTP 500.

After the fix, all Redis calls are replaced with get_pg_store() which uses Postgres.
These tests confirm the endpoint returns proper HTTP 401/422 status codes regardless
of Redis availability.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_login_json_user_not_found_returns_401():
    """POST /api/v1/auth/login/json with nonexistent email must return 401, not 500.

    This is the exact scenario that caused the Render HTTP 500:
    1. DB lookup for user succeeds (returns None — user not found)
    2. OLD code: would call redis.is_temporarily_locked() BEFORE returning 401
       → redis.exceptions.ConnectionError → HTTP 500
    3. NEW code: returns 401 immediately when user is None (no Redis call needed)
    """
    import httpx
    from httpx import ASGITransport

    from src.api.main import app

    # Mock DB: user not found
    mock_db = MagicMock()
    mock_db.get_user_by_email = AsyncMock(return_value=None)
    mock_db.get_user_by_phone = AsyncMock(return_value=None)

    # Mock pg_store: check_ip_rate_limit returns True (allow), no other calls needed
    mock_store = MagicMock()
    mock_store.check_ip_rate_limit = AsyncMock(return_value=True)

    with (
        patch("src.api.routes.auth.get_postgres_client", return_value=mock_db),
        patch("src.api.routes.auth.get_pg_store", return_value=mock_store),
    ):
        async with httpx.AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/auth/login/json",
                json={"email": "noone@example.com", "password": "wrongpassword"},
            )

    assert response.status_code == 401, (
        f"Expected 401 for unknown user, got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert body["detail"] == "Invalid credentials"
    # Confirm no Redis-related error text leaked into the response
    assert "redis" not in str(body).lower(), (
        f"Redis error text leaked into response: {body}"
    )
    assert "connectionerror" not in str(body).lower(), (
        f"ConnectionError text leaked into response: {body}"
    )


@pytest.mark.asyncio
async def test_login_json_missing_body_returns_422():
    """POST /api/v1/auth/login/json with empty body must return 422 (validation error)."""
    import httpx
    from httpx import ASGITransport

    from src.api.main import app

    # No mocking needed — Pydantic validation happens before any handler code
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/auth/login/json",
            json={},  # empty body — missing required fields
        )

    assert response.status_code == 422, (
        f"Expected 422 for missing body fields, got {response.status_code}: {response.text}"
    )
    # No redis imports in auth.py means no Redis error possible at this point either
    assert "redis" not in str(response.json()).lower()
