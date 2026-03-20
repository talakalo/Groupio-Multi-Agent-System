"""Authentication middleware for the API."""

import hmac
import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from src.config.settings import get_settings
from src.models.user import TokenPayload, UserInDB, UserRole

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def _get_token_from_header_or_cookie(
    request: Request,
    header_token: str | None = Depends(oauth2_scheme),
) -> str | None:
    """Return token from Authorization header first, else from access_token cookie."""
    if header_token:
        return header_token
    return request.cookies.get("access_token")


def _utcnow() -> datetime:
    """Return timezone-aware UTC now (replaces deprecated datetime.utcnow())."""
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(
    user_id: str,
    email: str,
    role: UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token.

    Each token includes a unique *jti* (JWT ID) claim so it can be added to a
    denylist (Redis) on logout or password change, enabling individual revocation
    before the token's natural expiry.
    """
    settings = get_settings()

    now = _utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "exp": expire,
        "iat": now,
        "type": "access",
        "jti": str(uuid4()),  # Unique token ID for revocation support
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token."""
    settings = get_settings()

    now = _utcnow()
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "type": "refresh",
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_access_token(token: str) -> TokenPayload | None:
    """Verify and decode an access token."""
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )

        if payload.get("type") != "access":
            return None

        return TokenPayload(
            sub=payload["sub"],
            email=payload["email"],
            role=UserRole(payload["role"]),
            exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
            iat=datetime.fromtimestamp(payload["iat"], tz=UTC),
            jti=payload.get("jti"),
        )
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid token: %s", e)
        return None


def verify_refresh_token(token: str) -> dict | None:
    """Verify and decode a refresh token."""
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )

        if payload.get("type") != "refresh":
            return None

        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Refresh token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid refresh token: %s", e)
        return None


async def get_current_user(
    token: str | None = Depends(_get_token_from_header_or_cookie),
) -> UserInDB:
    """Get the current authenticated user from the token."""
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check token denylist (for revoked tokens — logout, password change)
    if payload.jti:
        try:
            from src.databases.redis_client import get_redis_client
            redis = get_redis_client()
            if await redis.is_token_denylisted(payload.jti):
                raise HTTPException(
                    status_code=401,
                    detail="Token has been revoked",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Redis unavailable for denylist check — allowing token: %s", exc)

    # Fetch user from database
    from src.databases.postgres import get_postgres_client

    db = get_postgres_client()
    user = await db.get_user(payload.sub)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is disabled")

    return user


async def get_token_jti(
    token: str | None = Depends(_get_token_from_header_or_cookie),
) -> str | None:
    """Extract JTI from the current access token (no DB lookup).

    Used by logout and password-change to add the current token to the
    denylist so it cannot be replayed after revocation.
    """
    if not token:
        return None
    payload = verify_access_token(token)
    return payload.jti if payload else None


async def get_current_active_user(
    current_user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Get current user and verify they are active."""
    if not current_user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return current_user


async def get_admin_user(
    current_user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Get current user and verify they have admin privileges.

    Allows: admin, super_admin, buildings_manager.
    Use ``get_buildings_manager_user`` for buildings-specific endpoints.
    Use ``require_admin_only`` for sensitive admin ops (user mgmt, system settings, agents).
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BUILDINGS_MANAGER):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def get_buildings_manager_user(
    current_user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Get current user for buildings-specific endpoints.

    Allows: buildings_manager, admin, super_admin.
    Use for building management, building-scoped offers, etc.
    """
    if current_user.role not in (UserRole.BUILDINGS_MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Buildings manager or admin access required")
    return current_user


async def require_admin_only(
    current_user: UserInDB = Depends(get_current_user),
) -> UserInDB:
    """Get current user for admin-only endpoints (excludes buildings_manager).

    Allows: admin, super_admin only.
    Use for sensitive operations: user management, system settings, agent management.
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Admin-only access required")
    return current_user


async def verify_api_key(
    api_key: str | None = Security(api_key_header),
) -> str:
    """Verify the API key from the request header.

    Returns the validated API key string.
    Raises HTTPException 401 if invalid or missing.
    """
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    settings = get_settings()

    # Validate against configured API keys using timing-safe comparison.
    # The `in` operator short-circuits and leaks timing information; using
    # hmac.compare_digest for each key prevents timing-oracle attacks.
    if not settings.API_KEYS:
        logger.warning("No API keys configured - rejecting request")
        raise HTTPException(status_code=401, detail="API key validation not configured")

    if not any(hmac.compare_digest(api_key, k) for k in settings.API_KEYS):
        logger.warning("Invalid API key attempted")
        raise HTTPException(status_code=401, detail="Invalid API key")

    return api_key


def require_roles(*roles: UserRole):
    """Dependency factory to require specific roles."""

    async def role_checker(
        current_user: UserInDB = Depends(get_current_user),
    ) -> UserInDB:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Required roles: {[r.value for r in roles]}",
            )
        return current_user

    return role_checker


# Convenience: checks admin, super_admin, buildings_manager (same as get_admin_user)
ADMIN_ROLES = frozenset({UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BUILDINGS_MANAGER})


def is_admin(user: UserInDB) -> bool:
    """Return True if user has any admin-level role.

    Prefer using ``get_admin_user`` as a dependency.  This helper exists for
    inline checks where a dependency isn't convenient.
    """
    return user.role in ADMIN_ROLES
