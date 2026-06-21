"""Unit tests for the authentication API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(
    role: UserRole = UserRole.RESIDENT,
    is_active: bool = True,
    is_verified: bool = True,
    building_id: str | None = "b1",
) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hashed",
        is_active=is_active,
        is_verified=is_verified,
        preferred_language="he",
        building_id=building_id,
        created_at=now,
        updated_at=now,
    )


def _make_admin_user() -> UserInDB:
    return _make_user(role=UserRole.ADMIN)


def _setup_client(user=None):
    """Context manager: patch auth middleware so no real JWT is needed."""
    from src.api.main import app
    from src.api.middleware.auth import get_current_user

    if user:
        app.dependency_overrides[get_current_user] = lambda: user
    return app


# ---------------------------------------------------------------------------
# POST /auth/signup
# ---------------------------------------------------------------------------


class TestSignup:
    def test_signup_ok(self):
        created_user = _make_user(is_verified=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)
        db.get_user_by_phone = AsyncMock(return_value=None)
        db.create_user = AsyncMock(return_value=created_user)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.set = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.hash_password", return_value="hashed"):
                        with patch(
                            "src.api.routes.auth.create_access_token",
                            return_value="access-tok",
                        ):
                            with patch(
                                "src.api.routes.auth.create_refresh_token",
                                return_value="refresh-tok",
                            ):
                                client = TestClient(app, raise_server_exceptions=False)
                                resp = client.post(
                                    "/api/v1/auth/signup",
                                    json={
                                        "name": "Test User",
                                        "email": "user@example.com",
                                        "phone": "0501234567",
                                        "password": "password123",
                                        "buildingId": "b1",
                                    },
                                )
            assert resp.status_code == 200
            assert resp.json()["token"] == "access-tok"
        finally:
            app.dependency_overrides.clear()

    def test_signup_duplicate_email(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=_make_user())

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/signup",
                        json={
                            "name": "Test User",
                            "email": "user@example.com",
                            "phone": "0501234567",
                            "password": "password123",
                        },
                    )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_signup_duplicate_phone(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)
        db.get_user_by_phone = AsyncMock(return_value=_make_user())

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/signup",
                        json={
                            "name": "Test User",
                            "email": "new@example.com",
                            "phone": "0501234567",
                            "password": "password123",
                        },
                    )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_signup_rate_limited(self):
        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=False)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/signup",
                    json={
                        "name": "Test User",
                        "email": "user@example.com",
                        "phone": "0501234567",
                        "password": "password123",
                    },
                )
            assert resp.status_code == 429
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------


class TestRegister:
    def test_register_ok(self):
        created_user = _make_user(is_verified=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)
        db.get_user_by_phone = AsyncMock(return_value=None)
        db.create_user = AsyncMock(return_value=created_user)

        redis = AsyncMock()
        redis.set = AsyncMock()

        email_svc = AsyncMock()
        email_svc.send_verification_email = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.get_email_service", return_value=email_svc):
                        with patch("src.api.routes.auth.hash_password", return_value="hashed"):
                            client = TestClient(app, raise_server_exceptions=False)
                            resp = client.post(
                                "/api/v1/auth/register",
                                json={
                                    "email": "user@example.com",
                                    "phone": "0501234567",
                                    "password": "password123",
                                    "full_name": "Test User",
                                    "role": "resident",
                                },
                            )
            assert resp.status_code == 200
            email_svc.send_verification_email.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_register_duplicate_email(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=_make_user())

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/register",
                    json={
                        "email": "user@example.com",
                        "phone": "0501234567",
                        "password": "password123",
                        "full_name": "Test User",
                    },
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()

    def test_register_duplicate_phone(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)
        db.get_user_by_phone = AsyncMock(return_value=_make_user())

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/register",
                    json={
                        "email": "new@example.com",
                        "phone": "0501234567",
                        "password": "password123",
                        "full_name": "Test User",
                    },
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/login/json
# ---------------------------------------------------------------------------


class TestLoginJson:
    def test_login_json_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.set = AsyncMock()
        redis.clear_login_failures = AsyncMock()
        redis.clear_temporary_lockout = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        with patch(
                            "src.api.routes.auth.create_access_token",
                            return_value="access-tok",
                        ):
                            with patch(
                                "src.api.routes.auth.create_refresh_token",
                                return_value="refresh-tok",
                            ):
                                client = TestClient(app, raise_server_exceptions=False)
                                resp = client.post(
                                    "/api/v1/auth/login/json",
                                    json={
                                        "email": "user@example.com",
                                        "password": "password123",
                                    },
                                )
            assert resp.status_code == 200
            assert resp.json()["access_token"] == "access-tok"
        finally:
            app.dependency_overrides.clear()

    def test_login_json_user_not_found(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/login/json",
                        json={"email": "missing@example.com", "password": "pass"},
                    )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_login_json_wrong_password(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.increment_login_failures = AsyncMock(return_value=1)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=False):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login/json",
                            json={"email": "user@example.com", "password": "wrong"},
                        )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_login_json_account_locked_after_failures(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.increment_login_failures = AsyncMock(return_value=5)
        redis.set_temporary_lockout = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=False):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login/json",
                            json={"email": "user@example.com", "password": "wrong"},
                        )
            assert resp.status_code == 423
        finally:
            app.dependency_overrides.clear()

    def test_login_json_inactive_account(self):
        user = _make_user(is_active=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login/json",
                            json={"email": "user@example.com", "password": "password123"},
                        )
            assert resp.status_code == 423
        finally:
            app.dependency_overrides.clear()

    def test_login_json_unverified_when_enforced(self):
        """When ENFORCE_EMAIL_VERIFICATION=True, unverified user gets 403."""
        user = _make_user(is_verified=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)

        mock_settings = AsyncMock()
        mock_settings.ENFORCE_EMAIL_VERIFICATION = True
        mock_settings.REFRESH_TOKEN_EXPIRE_DAYS = 7
        mock_settings.ACCESS_TOKEN_EXPIRE_MINUTES = 15
        mock_settings.ENVIRONMENT = "development"

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        with patch("src.api.routes.auth.get_settings", return_value=mock_settings):
                            client = TestClient(app, raise_server_exceptions=False)
                            resp = client.post(
                                "/api/v1/auth/login/json",
                                json={"email": "user@example.com", "password": "password123"},
                            )
            assert resp.status_code == 403
            assert "verified" in resp.json().get("detail", "").lower()
        finally:
            app.dependency_overrides.clear()

    def test_login_json_by_phone(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_phone = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.set = AsyncMock()
        redis.clear_login_failures = AsyncMock()
        redis.clear_temporary_lockout = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        with patch(
                            "src.api.routes.auth.create_access_token",
                            return_value="tok",
                        ):
                            with patch(
                                "src.api.routes.auth.create_refresh_token",
                                return_value="ref",
                            ):
                                client = TestClient(app, raise_server_exceptions=False)
                                resp = client.post(
                                    "/api/v1/auth/login/json",
                                    json={"phone": "0501234567", "password": "password123"},
                                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


class TestRefreshToken:
    def test_refresh_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.get = AsyncMock(return_value="refresh-tok")
        redis.set = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch(
                        "src.api.routes.auth.verify_refresh_token",
                        return_value={"sub": "user-1"},
                    ):
                        with patch(
                            "src.api.routes.auth.create_access_token",
                            return_value="new-access",
                        ):
                            with patch(
                                "src.api.routes.auth.create_refresh_token",
                                return_value="new-refresh",
                            ):
                                client = TestClient(app, raise_server_exceptions=False)
                                resp = client.post(
                                    "/api/v1/auth/refresh",
                                    json={"refresh_token": "refresh-tok"},
                                )
            assert resp.status_code == 200
            assert resp.json()["access_token"] == "new-access"
        finally:
            app.dependency_overrides.clear()

    def test_refresh_no_token(self):
        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/api/v1/auth/refresh", json={})
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_refresh_invalid_token(self):
        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.verify_refresh_token", return_value=None):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/refresh",
                    json={"refresh_token": "bad-token"},
                )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_refresh_token_revoked(self):
        redis = AsyncMock()
        redis.get = AsyncMock(return_value="different-token")  # stored ≠ provided

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                with patch(
                    "src.api.routes.auth.verify_refresh_token",
                    return_value={"sub": "user-1"},
                ):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/refresh",
                        json={"refresh_token": "my-token"},
                    )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


class TestLogout:
    def test_logout_ok(self):
        user = _make_user()
        redis = AsyncMock()
        redis.delete = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/auth/logout")
            assert resp.status_code == 200
            assert resp.json()["status"] == "logged_out"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


class TestGetMe:
    def test_get_me_ok(self):
        user = _make_user()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 200
            assert resp.json()["email"] == "user@example.com"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# PUT /auth/me
# ---------------------------------------------------------------------------


class TestUpdateMe:
    def test_update_me_ok(self):
        user = _make_user()
        updated = _make_user()

        db = AsyncMock()
        db.get_user_by_phone = AsyncMock(return_value=None)
        db.update_user = AsyncMock(return_value=updated)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put(
                    "/api/v1/auth/me",
                    json={"full_name": "New Name"},
                )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    def test_update_me_phone_taken(self):
        user = _make_user()
        other_user = _make_user()
        other_user.id = "other-id"

        db = AsyncMock()
        # Return a different user for the phone check
        existing = _make_user()
        existing.id = "other-id"
        db.get_user_by_phone = AsyncMock(return_value=existing)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.put("/api/v1/auth/me", json={"phone": "0509999999"})
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/password/change
# ---------------------------------------------------------------------------


class TestChangePassword:
    def test_change_password_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_password_hash = AsyncMock(return_value="old-hashed")
        db.update_user_password = AsyncMock()

        redis = AsyncMock()
        redis.delete = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        with patch("src.api.routes.auth.hash_password", return_value="new-hashed"):
                            client = TestClient(app, raise_server_exceptions=False)
                            resp = client.post(
                                "/api/v1/auth/password/change",
                                json={
                                    "current_password": "oldpass",
                                    "new_password": "newpass123",
                                },
                            )
            assert resp.status_code == 200
            assert resp.json()["status"] == "password_changed"
        finally:
            app.dependency_overrides.clear()

    def test_change_password_wrong_current(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_password_hash = AsyncMock(return_value="hashed")

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.verify_password", return_value=False):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/password/change",
                        json={"current_password": "wrong", "new_password": "newpass123"},
                    )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/password/reset
# ---------------------------------------------------------------------------


class TestPasswordReset:
    def test_reset_user_found(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.set = AsyncMock()

        email_svc = AsyncMock()
        email_svc.send_password_reset_email = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.get_email_service", return_value=email_svc):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/password/reset",
                            json={"email": "user@example.com"},
                        )
            assert resp.status_code == 200
            assert resp.json()["status"] == "reset_email_sent"
            email_svc.send_password_reset_email.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_reset_email_send_failure_returns_503_and_cleans_redis(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.set = AsyncMock()
        redis.delete = AsyncMock()

        email_svc = AsyncMock()
        email_svc.send_password_reset_email = AsyncMock(side_effect=RuntimeError("SMTP down"))

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.get_email_service", return_value=email_svc):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/password/reset",
                            json={"email": "user@example.com"},
                        )
            assert resp.status_code == 503
            redis.delete.assert_called()
        finally:
            app.dependency_overrides.clear()

    def test_reset_user_not_found_no_reveal(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/password/reset",
                        json={"email": "ghost@example.com"},
                    )
            # Should NOT reveal whether email exists
            assert resp.status_code == 200
            assert resp.json()["status"] == "reset_email_sent"
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/password/reset/confirm
# ---------------------------------------------------------------------------


class TestPasswordResetConfirm:
    def test_confirm_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user = AsyncMock(return_value=user)
        db.update_user_password = AsyncMock()

        redis = AsyncMock()
        redis.get = AsyncMock(return_value="user-1")
        redis.delete = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.hash_password", return_value="new-hash"):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/password/reset/confirm",
                            json={"token": "reset-tok", "new_password": "newpass123"},
                        )
            assert resp.status_code == 200
            assert resp.json()["status"] == "password_reset_complete"
        finally:
            app.dependency_overrides.clear()

    def test_confirm_invalid_token(self):
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post(
                    "/api/v1/auth/password/reset/confirm",
                    json={"token": "bad-token", "new_password": "newpass123"},
                )
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/verify-email/{token}
# ---------------------------------------------------------------------------


class TestVerifyEmail:
    def test_verify_ok(self):
        db = AsyncMock()
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.get = AsyncMock(return_value="user-1")
        redis.delete = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/auth/verify-email/valid-token")
            assert resp.status_code == 200
            assert resp.json()["status"] == "email_verified"
        finally:
            app.dependency_overrides.clear()

    def test_verify_invalid_token(self):
        redis = AsyncMock()
        redis.get = AsyncMock(return_value=None)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                client = TestClient(app, raise_server_exceptions=False)
                resp = client.post("/api/v1/auth/verify-email/bad-token")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/resend-verification-by-email
# ---------------------------------------------------------------------------


class TestResendVerificationByEmail:
    def test_resend_by_email_unverified_user_sends(self):
        """When user exists and is unverified, sends email and returns 200."""
        user = _make_user(is_verified=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.set = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        email_svc = AsyncMock()
        email_svc.send_verification_email = AsyncMock()

        mock_settings = AsyncMock()
        mock_settings.FRONTEND_URL = "https://app.example.com"

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.get_email_service", return_value=email_svc):
                        with patch("src.api.routes.auth.get_settings", return_value=mock_settings):
                            client = TestClient(app, raise_server_exceptions=False)
                            resp = client.post(
                                "/api/v1/auth/resend-verification-by-email",
                                json={"email": "user@example.com"},
                            )
            assert resp.status_code == 200
            assert resp.json()["status"] == "verification_email_sent"
            email_svc.send_verification_email.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_resend_by_email_nonexistent_returns_200(self):
        """Always returns 200 to avoid leaking whether email exists."""
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/resend-verification-by-email",
                        json={"email": "nonexistent@example.com"},
                    )
            assert resp.status_code == 200
            assert resp.json()["status"] == "verification_email_sent"
        finally:
            app.dependency_overrides.clear()

    def test_resend_by_email_already_verified_returns_200(self):
        """Does not send when user is already verified; still returns 200."""
        user = _make_user(is_verified=True)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/resend-verification-by-email",
                        json={"email": "user@example.com"},
                    )
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/resend-verification
# ---------------------------------------------------------------------------


class TestResendVerification:
    def test_resend_ok(self):
        user = _make_user(is_verified=False)
        redis = AsyncMock()
        redis.set = AsyncMock()

        email_svc = AsyncMock()
        email_svc.send_verification_email = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                with patch("src.api.routes.auth.get_email_service", return_value=email_svc):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post("/api/v1/auth/resend-verification")
            assert resp.status_code == 200
            assert resp.json()["status"] == "verification_email_sent"
        finally:
            app.dependency_overrides.clear()

    def test_resend_already_verified(self):
        user = _make_user(is_verified=True)

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post("/api/v1/auth/resend-verification")
            assert resp.status_code == 400
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# DELETE /auth/me
# ---------------------------------------------------------------------------


class TestDeleteAccount:
    def test_delete_account_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.delete_user = AsyncMock()

        redis = AsyncMock()
        redis.delete = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.delete("/api/v1/auth/me")
            assert resp.status_code == 200
            assert resp.json()["status"] == "account_deleted"
        finally:
            app.dependency_overrides.clear()

    def test_delete_account_anonymises_on_no_delete_method(self):
        user = _make_user()
        db = AsyncMock()
        db.delete_user = AsyncMock(side_effect=AttributeError("no delete_user"))
        db.update_user = AsyncMock(return_value=user)

        redis = AsyncMock()
        redis.delete = AsyncMock()

        from src.api.main import app
        from src.api.middleware.auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: user
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.delete("/api/v1/auth/me")
            assert resp.status_code == 200
            db.update_user.assert_called_once()
        finally:
            app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /auth/login (OAuth2PasswordRequestForm - form-encoded)
# ---------------------------------------------------------------------------


class TestLoginForm:
    def test_login_form_ok(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.set = AsyncMock()
        redis.clear_login_failures = AsyncMock()
        redis.clear_temporary_lockout = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        with patch(
                            "src.api.routes.auth.create_access_token",
                            return_value="access-tok",
                        ):
                            with patch(
                                "src.api.routes.auth.create_refresh_token",
                                return_value="refresh-tok",
                            ):
                                client = TestClient(app, raise_server_exceptions=False)
                                resp = client.post(
                                    "/api/v1/auth/login",
                                    data={
                                        "username": "user@example.com",
                                        "password": "password123",
                                    },
                                )
            assert resp.status_code == 200
            assert resp.json()["access_token"] == "access-tok"
        finally:
            app.dependency_overrides.clear()

    def test_login_form_user_not_found(self):
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=None)

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    client = TestClient(app, raise_server_exceptions=False)
                    resp = client.post(
                        "/api/v1/auth/login",
                        data={"username": "missing@example.com", "password": "pass"},
                    )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_login_form_wrong_password(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.increment_login_failures = AsyncMock(return_value=1)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=False):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login",
                            data={"username": "user@example.com", "password": "wrong"},
                        )
            assert resp.status_code == 401
        finally:
            app.dependency_overrides.clear()

    def test_login_form_locks_after_5_failures(self):
        user = _make_user()
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")
        db.update_user = AsyncMock()

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)
        redis.increment_login_failures = AsyncMock(return_value=5)
        redis.set_temporary_lockout = AsyncMock()

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=False):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login",
                            data={"username": "user@example.com", "password": "wrong"},
                        )
            assert resp.status_code == 423
        finally:
            app.dependency_overrides.clear()

    def test_login_form_inactive_account(self):
        user = _make_user(is_active=False)
        db = AsyncMock()
        db.get_user_by_email = AsyncMock(return_value=user)
        db.get_user_password_hash = AsyncMock(return_value="hashed")

        redis = AsyncMock()
        redis.check_ip_rate_limit = AsyncMock(return_value=True)
        redis.is_temporarily_locked = AsyncMock(return_value=0)

        from src.api.main import app

        app.dependency_overrides.clear()
        try:
            with patch("src.api.routes.auth.get_postgres_client", return_value=db):
                with patch("src.api.routes.auth.get_pg_store", return_value=redis):
                    with patch("src.api.routes.auth.verify_password", return_value=True):
                        client = TestClient(app, raise_server_exceptions=False)
                        resp = client.post(
                            "/api/v1/auth/login",
                            data={"username": "user@example.com", "password": "password123"},
                        )
            assert resp.status_code == 423
        finally:
            app.dependency_overrides.clear()
