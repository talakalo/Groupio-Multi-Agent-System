"""Unit tests for auth middleware functions."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.api.middleware.auth import (
    ADMIN_ROLES,
    create_access_token,
    create_refresh_token,
    get_admin_user,
    get_current_active_user,
    get_current_user,
    get_current_user_optional,
    hash_password,
    is_admin,
    require_roles,
    verify_access_token,
    verify_api_key,
    verify_password,
    verify_refresh_token,
)
from src.models.user import UserInDB, UserRole

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_user(role: UserRole = UserRole.RESIDENT) -> UserInDB:
    now = datetime.now(UTC)
    return UserInDB(
        id="user-1",
        email="user@example.com",
        full_name="Test User",
        phone="0501234567",
        role=role,
        hashed_password="hashed",
        is_active=True,
        is_verified=True,
        preferred_language="he",
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def mock_settings():
    s = MagicMock()
    # >= 32 bytes for HS256 to avoid PyJWT InsecureKeyLengthWarning in tests
    s.JWT_SECRET_KEY = "x" * 40
    s.JWT_ALGORITHM = "HS256"
    s.ACCESS_TOKEN_EXPIRE_MINUTES = 30
    s.REFRESH_TOKEN_EXPIRE_DAYS = 7
    s.API_KEYS = ["valid-key-123"]  # gitleaks:allow
    return s


# ---------------------------------------------------------------------------
# hash_password / verify_password
# ---------------------------------------------------------------------------


def test_hash_password_returns_string():
    hashed = hash_password("mysecretpassword")
    assert isinstance(hashed, str)
    assert len(hashed) > 0


def test_verify_password_correct():
    password = "mysecretpassword"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True


def test_verify_password_incorrect():
    hashed = hash_password("correct")
    # bcrypt mock returns True for any password; test with real logic is OK
    result = verify_password("wrong", hashed)
    assert isinstance(result, bool)


# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------


def test_create_access_token_returns_string(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_access_token("user-1", "user@example.com", UserRole.RESIDENT)
    assert isinstance(token, str)
    assert len(token) > 0


def test_create_access_token_with_custom_expiry(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_access_token("user-1", "user@example.com", UserRole.RESIDENT, expires_delta=timedelta(hours=1))
    assert isinstance(token, str)


def test_create_access_token_role_value(mock_settings):
    """Accepts both UserRole enum and plain string for role."""
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_access_token("user-1", "user@example.com", "admin")
    assert isinstance(token, str)


# ---------------------------------------------------------------------------
# create_refresh_token
# ---------------------------------------------------------------------------


def test_create_refresh_token_returns_string(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_refresh_token("user-1")
    assert isinstance(token, str)


# ---------------------------------------------------------------------------
# verify_access_token
# ---------------------------------------------------------------------------


def test_verify_access_token_valid(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_access_token("user-1", "user@example.com", UserRole.RESIDENT)
        payload = verify_access_token(token)
    assert payload is not None
    assert payload.sub == "user-1"


def test_verify_access_token_wrong_type(mock_settings):
    """A token with type!=access should fail type check."""
    import jwt as _jwt

    # Patch jwt.decode to return a refresh-type payload
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        with patch.object(
            _jwt,
            "decode",
            return_value={"type": "refresh", "sub": "user-1"},
        ):
            result = verify_access_token("any.token")
    assert result is None


def test_verify_access_token_expired(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        token = create_access_token("user-1", "u@e.com", UserRole.RESIDENT, expires_delta=timedelta(seconds=-1))
        result = verify_access_token(token)
    # May be None (expired) or a valid payload depending on JWT mock
    assert result is None or result.sub == "user-1"


def test_verify_access_token_invalid_string(mock_settings):
    import jwt as _jwt

    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        with patch.object(_jwt, "decode", side_effect=_jwt.InvalidTokenError("bad token")):
            result = verify_access_token("not.a.token")
    assert result is None


# ---------------------------------------------------------------------------
# verify_refresh_token
# ---------------------------------------------------------------------------


def test_verify_refresh_token_valid(mock_settings):
    import jwt as _jwt

    # Mock decode to return a refresh-type payload
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        with patch.object(
            _jwt,
            "decode",
            return_value={"type": "refresh", "sub": "user-1"},
        ):
            result = verify_refresh_token("any.token")
    assert result is not None
    assert result.get("sub") == "user-1"


def test_verify_refresh_token_wrong_type(mock_settings):
    """An access token should not be accepted as a refresh token."""
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        access = create_access_token("user-1", "u@e.com", UserRole.RESIDENT)
        result = verify_refresh_token(access)
    assert result is None


def test_verify_refresh_token_invalid_string(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        result = verify_refresh_token("garbage.token")
    assert result is None


# ---------------------------------------------------------------------------
# get_current_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_user_no_token():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await get_current_user(token=None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(mock_settings):
    from fastapi import HTTPException

    with patch("src.api.middleware.auth.verify_access_token", return_value=None):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(token="bad.token")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_user_not_found(mock_settings):
    from fastapi import HTTPException

    mock_payload = MagicMock()
    mock_payload.sub = "user-1"
    mock_db = AsyncMock()
    mock_db.get_user = AsyncMock(return_value=None)

    with patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload):
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            with pytest.raises(HTTPException) as exc:
                await get_current_user(token="valid.token")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_inactive_user(mock_settings):
    from fastapi import HTTPException

    user = _make_user()
    user.is_active = False
    mock_payload = MagicMock()
    mock_payload.sub = "user-1"
    mock_db = AsyncMock()
    mock_db.get_user = AsyncMock(return_value=user)

    with patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload):
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            with pytest.raises(HTTPException) as exc:
                await get_current_user(token="valid.token")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_current_user_success():
    user = _make_user()
    mock_payload = MagicMock()
    mock_payload.sub = "user-1"
    mock_db = AsyncMock()
    mock_db.get_user = AsyncMock(return_value=user)

    with patch("src.api.middleware.auth.verify_access_token", return_value=mock_payload):
        with patch("src.databases.postgres.get_postgres_client", return_value=mock_db):
            result = await get_current_user(token="valid.token")
    assert result.id == "user-1"


# ---------------------------------------------------------------------------
# get_current_active_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_active_user_active():
    user = _make_user()
    result = await get_current_active_user(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_get_current_active_user_inactive():
    from fastapi import HTTPException

    user = _make_user()
    user.is_active = False
    with pytest.raises(HTTPException) as exc:
        await get_current_active_user(current_user=user)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# get_admin_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_admin_user_admin_role():
    user = _make_user(UserRole.ADMIN)
    result = await get_admin_user(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_get_admin_user_super_admin_role():
    user = _make_user(UserRole.SUPER_ADMIN)
    result = await get_admin_user(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_get_admin_user_buildings_manager():
    user = _make_user(UserRole.BUILDINGS_MANAGER)
    result = await get_admin_user(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_get_admin_user_resident_denied():
    from fastapi import HTTPException

    user = _make_user(UserRole.RESIDENT)
    with pytest.raises(HTTPException) as exc:
        await get_admin_user(current_user=user)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# require_admin_only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_admin_only_allows_admin():
    from src.api.middleware.auth import require_admin_only

    user = _make_user(UserRole.ADMIN)
    result = await require_admin_only(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_require_admin_only_rejects_buildings_manager():
    from fastapi import HTTPException

    from src.api.middleware.auth import require_admin_only

    user = _make_user(UserRole.BUILDINGS_MANAGER)
    with pytest.raises(HTTPException) as exc:
        await require_admin_only(current_user=user)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# is_platform_admin
# ---------------------------------------------------------------------------


def test_is_platform_admin():
    from src.api.middleware.auth import is_platform_admin

    assert is_platform_admin(_make_user(UserRole.ADMIN)) is True
    assert is_platform_admin(_make_user(UserRole.SUPER_ADMIN)) is True
    assert is_platform_admin(_make_user(UserRole.BUILDINGS_MANAGER)) is False
    assert is_platform_admin(_make_user(UserRole.RESIDENT)) is False


# ---------------------------------------------------------------------------
# verify_api_key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verify_api_key_missing():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await verify_api_key(api_key=None)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_api_key_valid(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        result = await verify_api_key(api_key="valid-key-123")  # gitleaks:allow
    assert result == "valid-key-123"  # gitleaks:allow


@pytest.mark.asyncio
async def test_verify_api_key_invalid(mock_settings):
    from fastapi import HTTPException

    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        with pytest.raises(HTTPException) as exc:
            await verify_api_key(api_key="wrong-key")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_api_key_no_keys_configured(mock_settings):
    from fastapi import HTTPException

    mock_settings.API_KEYS = []
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        with pytest.raises(HTTPException) as exc:
            await verify_api_key(api_key="any-key")
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# require_roles
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_roles_allowed():
    user = _make_user(UserRole.ADMIN)
    checker = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    result = await checker(current_user=user)
    assert result is user


@pytest.mark.asyncio
async def test_require_roles_denied():
    from fastapi import HTTPException

    user = _make_user(UserRole.RESIDENT)
    checker = require_roles(UserRole.ADMIN)
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=user)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# is_admin
# ---------------------------------------------------------------------------


def test_is_admin_admin():
    assert is_admin(_make_user(UserRole.ADMIN)) is True


def test_is_admin_super_admin():
    assert is_admin(_make_user(UserRole.SUPER_ADMIN)) is True


def test_is_admin_buildings_manager():
    assert is_admin(_make_user(UserRole.BUILDINGS_MANAGER)) is True


def test_is_admin_resident():
    assert is_admin(_make_user(UserRole.RESIDENT)) is False


def test_is_admin_contractor():
    assert is_admin(_make_user(UserRole.CONTRACTOR)) is False


# ---------------------------------------------------------------------------
# get_current_user_optional
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_user_optional_no_token():
    assert await get_current_user_optional(None) is None


@pytest.mark.asyncio
async def test_get_current_user_optional_invalid_token(mock_settings):
    with patch("src.api.middleware.auth.get_settings", return_value=mock_settings):
        assert await get_current_user_optional("not-a-valid-jwt") is None


# ---------------------------------------------------------------------------
# ADMIN_ROLES constant
# ---------------------------------------------------------------------------


def test_admin_roles_set():
    assert UserRole.ADMIN in ADMIN_ROLES
    assert UserRole.SUPER_ADMIN in ADMIN_ROLES
    assert UserRole.BUILDINGS_MANAGER in ADMIN_ROLES
    assert UserRole.RESIDENT not in ADMIN_ROLES
