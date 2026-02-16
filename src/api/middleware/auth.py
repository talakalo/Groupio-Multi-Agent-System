"""Authentication middleware for the API."""

import logging
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer

from src.config.settings import get_settings
from src.models.user import TokenPayload, UserInDB, UserRole

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


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
    """Create a JWT access token."""
    settings = get_settings()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access",
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token."""
    settings = get_settings()

    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.utcnow(),
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
            exp=datetime.fromtimestamp(payload["exp"]),
            iat=datetime.fromtimestamp(payload["iat"]),
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
    token: str | None = Depends(oauth2_scheme),
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

    # Fetch user from database
    from src.databases.postgres import get_postgres_client

    db = get_postgres_client()
    user = await db.get_user(payload.sub)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is disabled")

    return user


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
    """Get current user and verify they have admin privileges."""
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.BUILDINGS_MANAGER):
        raise HTTPException(status_code=403, detail="Admin access required")
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

    # Validate against configured API keys
    if not settings.API_KEYS:
        logger.warning("No API keys configured - rejecting request")
        raise HTTPException(status_code=401, detail="API key validation not configured")

    if api_key not in settings.API_KEYS:
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
