"""Cookie SameSite hardening (C6).

Login, login-json, and refresh-token responses set cookies with
``samesite="strict"`` in production and ``samesite="lax"`` everywhere else.
``samesite="strict"`` blocks the cookie from being sent on cross-site
requests entirely (mitigating CSRF), but breaks the localhost dev flow
where the web app on :3000 and the API on :8000 are technically
different sites.

This module mixes two test styles intentionally:
  * a static source-level invariant (no FastAPI app import — runs without
    bcrypt / asyncpg / etc.) to pin the rule in place
  * a parametrised integration test that boots the FastAPI app and asserts
    the wire-level Set-Cookie header — relies on the full backend stack so
    it's the CI-native test, not the local-only one
"""

from __future__ import annotations

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Static source-level invariant — no imports of the backend stack so this
# test runs in any Python environment, even one without bcrypt / asyncpg.
# ---------------------------------------------------------------------------


_AUTH_SRC = Path(__file__).resolve().parents[2] / "src" / "api" / "routes" / "auth.py"
_SAMESITE_EXPR = 'samesite="strict" if settings.ENVIRONMENT == "production" else "lax"'


def test_all_set_cookie_sites_use_environment_aware_samesite() -> None:
    """Pin the rule: every ``response.set_cookie()`` call in auth.py uses
    the environment-aware SameSite expression. Catches a regression where
    a future edit hard-codes ``samesite="lax"`` on a new endpoint."""
    text = _AUTH_SRC.read_text()
    set_cookie_count = text.count("response.set_cookie(")
    expr_count = text.count(_SAMESITE_EXPR)

    assert set_cookie_count > 0, "no set_cookie() calls found — refactor sentinel"
    assert expr_count == set_cookie_count, (
        f"{set_cookie_count} response.set_cookie() calls but only {expr_count} "
        f"use the environment-aware SameSite expression"
    )


def test_no_unconditional_samesite_lax_remains_in_auth_routes() -> None:
    """Bare ``samesite="lax"`` lines are forbidden in auth routes — they'd
    weaken CSRF protection in production. Allowed only inside the conditional
    expression above."""
    text = _AUTH_SRC.read_text()
    # Strip out the conditional expression to detect any *standalone*
    # samesite="lax" hard-codes.
    stripped = text.replace(_SAMESITE_EXPR, "")
    assert 'samesite="lax"' not in stripped, (
        'auth.py contains an unconditional samesite="lax" — every '
        "set_cookie call must use the env-aware ternary instead"
    )


# ---------------------------------------------------------------------------
# Wire-level parametrised test — runs against the live FastAPI app. Skips
# itself when the backend stack (bcrypt etc.) isn't importable, so it stays
# usable in stripped local envs while running for real in CI.
# ---------------------------------------------------------------------------


def _samesite_for(set_cookie_headers: list[str], cookie_name: str) -> str | None:
    for header in set_cookie_headers:
        if header.startswith(f"{cookie_name}="):
            for part in header.split(";"):
                key, _, value = part.strip().partition("=")
                if key.lower() == "samesite":
                    return value.strip().lower()
    return None


@pytest.mark.parametrize(
    "env, expected",
    [
        ("production", "strict"),
        ("staging", "lax"),
        ("development", "lax"),
        ("testing", "lax"),
    ],
)
def test_login_json_set_cookie_samesite_matches_environment(env, expected, monkeypatch):
    """Production gets SameSite=strict; every other env gets SameSite=lax."""
    pytest.importorskip("bcrypt")
    pytest.importorskip("asyncpg")
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from src.api.main import app
    from src.api.routes import auth as auth_route

    user = AsyncMock()
    user.id = "user-1"
    user.email = "u@example.com"
    user.is_active = True
    user.is_verified = True
    user.role = "resident"

    db = AsyncMock()
    db.get_user_by_email = AsyncMock(return_value=user)
    db.get_user_password_hash = AsyncMock(return_value="hash")
    db.update_user = AsyncMock()

    monkeypatch.setattr(auth_route, "get_postgres_client", lambda: db)
    monkeypatch.setattr(auth_route, "verify_password", lambda *_: True)
    monkeypatch.setattr(auth_route, "create_access_token", lambda *_a, **_k: "atoken")
    monkeypatch.setattr(auth_route, "create_refresh_token", lambda *_a, **_k: "rtoken")
    redis = AsyncMock()
    redis.is_temporarily_locked = AsyncMock(return_value=0)
    redis.clear_login_failures = AsyncMock()
    redis.clear_temporary_lockout = AsyncMock()
    redis.set = AsyncMock()
    monkeypatch.setattr(auth_route, "get_pg_store", lambda: redis)

    settings_stub = AsyncMock()
    settings_stub.ENVIRONMENT = env
    settings_stub.REFRESH_TOKEN_EXPIRE_DAYS = 7
    settings_stub.ACCESS_TOKEN_EXPIRE_MINUTES = 60

    with patch.object(auth_route, "get_settings", return_value=settings_stub):
        with TestClient(app) as client:
            r = client.post(
                "/api/v1/auth/login/json",
                json={"email": "u@example.com", "password": "secret123"},
            )

    assert r.status_code == 200, r.text
    set_cookies = r.headers.get_list("set-cookie")
    refresh_samesite = _samesite_for(set_cookies, "refresh_token")
    access_samesite = _samesite_for(set_cookies, "access_token")
    assert refresh_samesite == expected, (
        f"refresh_token SameSite: expected {expected!r} in {env}, got {refresh_samesite!r}"
    )
    assert access_samesite == expected, (
        f"access_token SameSite: expected {expected!r} in {env}, got {access_samesite!r}"
    )
