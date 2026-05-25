"""Unit tests for AI governance Patch 2 — critical defect fixes.

Tests are designed to FAIL on the pre-Patch-2 code and PASS after the patch.

Coverage:
  A. Email verification gate in get_current_user (auth.py)
  B. Payment agent reads PAYMENT_AGENT_MODE from DB at call time (payment.py)
  C. GET /admin/agents/autonomy reads from system_settings DB (admin.py)

Integration-level route tests (approve/reject execution, audit logs) live in
tests/integration/test_governance_patch2_integration.py.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.models.user import UserInDB, UserRole


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _make_user(
    role: UserRole = UserRole.RESIDENT,
    is_active: bool = True,
    is_verified: bool = True,
    uid: str = "user-1",
) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id=uid,
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hashed",
        is_active=is_active,
        is_verified=is_verified,
        preferred_language="he",
        building_id="b1",
        created_at=now,
        updated_at=now,
    )


def _make_admin() -> UserInDB:
    return _make_user(role=UserRole.ADMIN, is_verified=True, uid="admin-1")


def _make_mock_token_payload(uid: str = "user-1", jti: str = "jti-1") -> MagicMock:
    payload = MagicMock()
    payload.sub = uid
    payload.jti = jti
    return payload


def _build_mock_redis(denylisted: bool = False) -> AsyncMock:
    redis = AsyncMock()
    redis.is_token_denylisted = AsyncMock(return_value=denylisted)
    return redis


def _build_mock_db(user: UserInDB) -> AsyncMock:
    db = AsyncMock()
    db.get_user = AsyncMock(return_value=user)
    return db


def _build_mock_settings(enforce_verification: bool = True) -> MagicMock:
    s = MagicMock()
    s.ENFORCE_EMAIL_VERIFICATION = enforce_verification
    return s


# ===========================================================================
# A. Email verification gate in get_current_user
# ===========================================================================


class TestEmailVerificationGate:
    """get_current_user must enforce ENFORCE_EMAIL_VERIFICATION before returning.

    Pre-Patch-2: no is_verified check existed — unverified users passed through.
    Post-Patch-2: 403 is raised when ENFORCE_EMAIL_VERIFICATION=True and user.is_verified=False.
    """

    async def test_unverified_user_blocked_when_enforcement_enabled(self):
        """HTTP 403 raised for an unverified user when enforcement is on."""
        from fastapi import HTTPException

        from src.api.middleware.auth import get_current_user

        unverified = _make_user(is_verified=False)
        mock_payload = _make_mock_token_payload()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=_build_mock_settings(True)),
            patch(
                "src.databases.redis_client.get_redis_client",
                return_value=_build_mock_redis(denylisted=False),
            ),
            patch(
                "src.databases.postgres.get_postgres_client",
                return_value=_build_mock_db(unverified),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(token="any-token")

        assert exc_info.value.status_code == 403
        assert "verif" in exc_info.value.detail.lower()

    async def test_verified_user_returns_normally(self):
        """Verified user is returned without exception."""
        from src.api.middleware.auth import get_current_user

        verified = _make_user(is_verified=True)
        mock_payload = _make_mock_token_payload()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=_build_mock_settings(True)),
            patch(
                "src.databases.redis_client.get_redis_client",
                return_value=_build_mock_redis(denylisted=False),
            ),
            patch(
                "src.databases.postgres.get_postgres_client",
                return_value=_build_mock_db(verified),
            ),
        ):
            result = await get_current_user(token="any-token")

        assert result.id == "user-1"

    async def test_enforcement_disabled_allows_unverified(self):
        """When ENFORCE_EMAIL_VERIFICATION=False, unverified users pass through."""
        from src.api.middleware.auth import get_current_user

        unverified = _make_user(is_verified=False)
        mock_payload = _make_mock_token_payload()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=_build_mock_settings(False)),
            patch(
                "src.databases.redis_client.get_redis_client",
                return_value=_build_mock_redis(denylisted=False),
            ),
            patch(
                "src.databases.postgres.get_postgres_client",
                return_value=_build_mock_db(unverified),
            ),
        ):
            result = await get_current_user(token="any-token")

        assert result.id == "user-1"

    async def test_inactive_user_blocked_before_verification_check(self):
        """Inactive user raises 403 with 'disabled' detail, not a verification message."""
        from fastapi import HTTPException

        from src.api.middleware.auth import get_current_user

        # is_verified=True but is_active=False — should fail on the is_active check
        inactive = _make_user(is_active=False, is_verified=True)
        mock_payload = _make_mock_token_payload()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=_build_mock_settings(True)),
            patch(
                "src.databases.redis_client.get_redis_client",
                return_value=_build_mock_redis(denylisted=False),
            ),
            patch(
                "src.databases.postgres.get_postgres_client",
                return_value=_build_mock_db(inactive),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(token="any-token")

        assert exc_info.value.status_code == 403
        assert "disabled" in exc_info.value.detail.lower()

    async def test_revoked_token_blocked_before_verification_check(self):
        """Denylisted token raises 401 — verification check never reached."""
        from fastapi import HTTPException

        from src.api.middleware.auth import get_current_user

        verified = _make_user(is_verified=True)
        mock_payload = _make_mock_token_payload()

        with (
            patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload),
            patch("src.api.middleware.auth.get_settings", return_value=_build_mock_settings(True)),
            patch(
                "src.databases.redis_client.get_redis_client",
                return_value=_build_mock_redis(denylisted=True),
            ),
            patch(
                "src.databases.postgres.get_postgres_client",
                return_value=_build_mock_db(verified),
            ),
        ):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(token="any-token")

        assert exc_info.value.status_code == 401
        assert "revoked" in exc_info.value.detail.lower()


# ===========================================================================
# B. Payment agent mode resolution — DB-first, env fallback
# ===========================================================================


class TestPaymentAgentModeResolution:
    """PaymentAgent._handle_refund_request reads PAYMENT_AGENT_MODE from DB first.

    Pre-Patch-2: only read get_settings().PAYMENT_AGENT_MODE (env-based, cached).
    Post-Patch-2: reads from system_settings DB, env is fallback only.
    """

    def _make_state(self) -> dict:
        return {
            "user_id": "user-1",
            "messages": [{"role": "user", "content": "refund החזר"}],
            "actions_taken": [],
        }

    async def test_db_mode_auto_overrides_env_gated(self):
        """DB value 'auto' is used even when env says 'gated'."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "gated"  # env says gated

        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": "auto"}]  # DB says auto
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)

        agent = PaymentAgent()
        state = self._make_state()

        # get_settings is imported inside the function body with `from … import`,
        # so patch the source module attribute (not the agent module).
        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            patch.object(agent, "_handle_refund_auto", new_callable=AsyncMock, return_value=state) as mock_auto,
            patch.object(agent, "_handle_refund_gated", new_callable=AsyncMock, return_value=state) as mock_gated,
        ):
            await agent._handle_refund_request(state, "user-1", "refund")

        mock_auto.assert_awaited_once()
        mock_gated.assert_not_awaited()

    async def test_db_mode_recommend_routes_to_gated_handler(self):
        """DB value 'recommend' routes to _handle_refund_gated."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "auto"  # env says auto

        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": "recommend"}]  # DB says recommend
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)

        agent = PaymentAgent()
        state = self._make_state()

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            patch.object(agent, "_handle_refund_auto", new_callable=AsyncMock, return_value=state) as mock_auto,
            patch.object(agent, "_handle_refund_gated", new_callable=AsyncMock, return_value=state) as mock_gated,
        ):
            await agent._handle_refund_request(state, "user-1", "refund")

        mock_gated.assert_awaited_once()
        mock_auto.assert_not_awaited()

    async def test_env_fallback_when_db_raises(self):
        """Env value is used as fallback when DB call fails."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "gated"  # env says gated

        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(side_effect=RuntimeError("DB down"))

        agent = PaymentAgent()
        state = self._make_state()

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            patch.object(agent, "_handle_refund_auto", new_callable=AsyncMock, return_value=state) as mock_auto,
            patch.object(agent, "_handle_refund_gated", new_callable=AsyncMock, return_value=state) as mock_gated,
        ):
            await agent._handle_refund_request(state, "user-1", "refund")

        # env fallback = gated → gated handler
        mock_gated.assert_awaited_once()
        mock_auto.assert_not_awaited()

    async def test_empty_db_value_falls_back_to_env(self):
        """Empty string or missing DB entry falls back to env."""
        from src.agents.payment import PaymentAgent

        env_settings = MagicMock()
        env_settings.PAYMENT_AGENT_MODE = "auto"  # env says auto

        # DB has the key but with an empty/None value
        db_rows = [{"key": "PAYMENT_AGENT_MODE", "value": ""}]
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)

        agent = PaymentAgent()
        state = self._make_state()

        with (
            patch("src.config.settings.get_settings", return_value=env_settings),
            patch("src.agents.payment.get_postgres_client", return_value=mock_db),
            patch.object(agent, "_handle_refund_auto", new_callable=AsyncMock, return_value=state) as mock_auto,
            patch.object(agent, "_handle_refund_gated", new_callable=AsyncMock, return_value=state) as mock_gated,
        ):
            await agent._handle_refund_request(state, "user-1", "refund")

        mock_auto.assert_awaited_once()  # env fallback = auto
        mock_gated.assert_not_awaited()


# ===========================================================================
# C. GET /admin/agents/autonomy reads from DB, not env cache
# ===========================================================================


class TestAutonomyModeDBFirst:
    """get_agent_autonomy_modes returns DB values when present.

    Pre-Patch-2: read only from get_settings() (env @lru_cache — changes after PUT
    /admin/settings were silently discarded on the next GET).
    Post-Patch-2: reads from system_settings DB first, env is fallback only.
    """

    def test_autonomy_shows_db_value_not_env(self):
        """DB value 'auto' is returned even when env says 'gated'."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.api.middleware.auth import get_admin_user, get_current_user

        admin = _make_admin()

        db_rows = [
            {"key": "MATCHING_AGENT_MODE", "value": "auto"},
            {"key": "PRICING_AGENT_MODE", "value": "auto"},
            {"key": "VETTING_AGENT_MODE", "value": "auto"},
            {"key": "OUTREACH_AGENT_MODE", "value": "auto"},
            {"key": "PAYMENT_AGENT_MODE", "value": "auto"},
        ]
        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=db_rows)

        env_settings = MagicMock()
        env_settings.MATCHING_AGENT_MODE = "gated"
        env_settings.PRICING_AGENT_MODE = "gated"
        env_settings.VETTING_AGENT_MODE = "gated"
        env_settings.OUTREACH_AGENT_MODE = "gated"
        env_settings.PAYMENT_AGENT_MODE = "gated"

        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with (
                patch("src.api.routes.admin.get_postgres_client", return_value=mock_db),
                patch("src.config.settings.get_settings", return_value=env_settings),
            ):
                client = TestClient(app)
                resp = client.get("/api/v1/admin/agents/autonomy")

            assert resp.status_code == 200
            data = resp.json()
            # Must reflect DB values, not env values
            assert data["payment"] == "auto", f"Expected 'auto' from DB, got {data['payment']!r}"
            assert data["matching"] == "auto"
            assert data["outreach"] == "auto"
        finally:
            app.dependency_overrides.clear()

    def test_autonomy_falls_back_to_env_when_db_empty(self):
        """When system_settings has no mode keys, env defaults are used."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.api.middleware.auth import get_admin_user, get_current_user

        admin = _make_admin()

        mock_db = AsyncMock()
        mock_db.get_system_settings = AsyncMock(return_value=[])  # empty DB

        env_settings = MagicMock()
        env_settings.MATCHING_AGENT_MODE = "recommend"
        env_settings.PRICING_AGENT_MODE = "recommend"
        env_settings.VETTING_AGENT_MODE = "recommend"
        env_settings.OUTREACH_AGENT_MODE = "gated"
        env_settings.PAYMENT_AGENT_MODE = "gated"

        app.dependency_overrides[get_admin_user] = lambda: admin
        app.dependency_overrides[get_current_user] = lambda: admin
        try:
            with (
                patch("src.api.routes.admin.get_postgres_client", return_value=mock_db),
                patch("src.config.settings.get_settings", return_value=env_settings),
            ):
                client = TestClient(app)
                resp = client.get("/api/v1/admin/agents/autonomy")

            assert resp.status_code == 200
            data = resp.json()
            assert data["payment"] == "gated"   # env fallback
            assert data["matching"] == "recommend"  # env fallback
        finally:
            app.dependency_overrides.clear()
