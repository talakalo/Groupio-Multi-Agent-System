"""Authentication API routes."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field

from src.api.middleware.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.models.user import (
    LoginRequest,
    PasswordChange,
    PasswordReset,
    PasswordResetConfirm,
    TokenResponse,
    UserCreate,
    UserInDB,
    UserResponse,
    UserRole,
    UserUpdate,
)
from src.services.email import get_email_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


class SignupRequest(BaseModel):
    """Signup request (frontend format: name, buildingId)."""

    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r"^0\d{8,9}$")
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.RESIDENT
    building_id: str | None = Field(None, alias="buildingId")

    model_config = {"populate_by_name": True}


class RefreshRequest(BaseModel):
    """Optional body for refresh endpoint (frontend may send refresh_token in JSON)."""

    refresh_token: str | None = None


class SignupResponse(BaseModel):
    """Signup response with token and user (auto-login)."""

    token: str
    user: UserResponse


@router.post("/signup", response_model=SignupResponse)
async def signup(request: SignupRequest) -> SignupResponse:
    """Register a new user and return token (auto-login)."""
    db = get_postgres_client()

    existing = await db.get_user_by_email(request.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_phone = await db.get_user_by_phone(request.phone)
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    user_id = str(uuid4())
    hashed_password = hash_password(request.password)

    user_data = {
        "id": user_id,
        "email": request.email,
        "full_name": request.name,
        "phone": request.phone,
        "role": request.role,
        "building_id": request.building_id,
        "hashed_password": hashed_password,
        "is_active": True,
        "is_verified": False,
    }

    user = await db.create_user(user_data)

    logger.info("User registered via signup: %s", user.email)

    # Auto-login: create token
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    settings = get_settings()
    redis = get_redis_client()
    await redis.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return SignupResponse(
        token=access_token,
        user=user,
    )


@router.post("/register", response_model=UserResponse)
async def register(request: UserCreate) -> UserResponse:
    """Register a new user."""
    db = get_postgres_client()

    # Check if email exists
    existing = await db.get_user_by_email(request.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check if phone exists
    existing_phone = await db.get_user_by_phone(request.phone)
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    user_id = str(uuid4())
    hashed_password = hash_password(request.password)

    user_data = request.model_dump(exclude={"password"})
    user_data["id"] = user_id
    user_data["hashed_password"] = hashed_password
    user_data["is_active"] = True
    user_data["is_verified"] = False

    user = await db.create_user(user_data)

    logger.info("User registered: %s", user.email)

    # Send verification email
    verify_token = str(uuid4())
    redis = get_redis_client()
    await redis.set(
        f"email_verify:{verify_token}",
        user.id,
        ex=24 * 60 * 60,  # 24 hour expiry
    )

    email_service = get_email_service()
    await email_service.send_verification_email(
        to_email=user.email,
        user_name=user.full_name or user.email.split("@")[0],
        verification_token=verify_token,
    )

    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> TokenResponse:
    """Login and get access token."""
    db = get_postgres_client()

    user = await db.get_user_by_email(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Verify password
    hashed = await db.get_user_password_hash(user.id)
    if not verify_password(form_data.password, hashed):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    settings = get_settings()

    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    # Store refresh token in Redis
    redis = get_redis_client()
    await redis.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    # Update last login
    await db.update_user(user.id, {"last_login": datetime.now(timezone.utc)})

    # Set refresh token as HTTP-only cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )

    logger.info("User logged in: %s", user.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login/json", response_model=TokenResponse)
async def login_json(
    request: LoginRequest,
    response: Response,
) -> TokenResponse:
    """Login with JSON body (email or phone)."""
    db = get_postgres_client()

    if request.email:
        user = await db.get_user_by_email(request.email)
    else:
        assert request.phone is not None  # validated by LoginRequest
        user = await db.get_user_by_phone(request.phone)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    hashed = await db.get_user_password_hash(user.id)
    if not verify_password(request.password, hashed):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    settings = get_settings()

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    redis = get_redis_client()
    await redis.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    await db.update_user(user.id, {"last_login": datetime.now(timezone.utc)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
) -> TokenResponse:
    """Refresh access token. Accepts token in JSON body (refresh_token) or in cookie (refresh_token)."""
    token = body.refresh_token if body else None
    if not token and request.cookies:
        token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token required")

    payload = verify_refresh_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")

    # Verify token in Redis
    redis = get_redis_client()
    stored_token = await redis.get(f"refresh_token:{user_id}")
    if stored_token != token:
        raise HTTPException(status_code=401, detail="Refresh token revoked")

    db = get_postgres_client()
    user = await db.get_user(user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    settings = get_settings()

    # Create new tokens
    new_access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    new_refresh_token = create_refresh_token(user_id=user.id)

    # Update stored refresh token
    await redis.set(
        f"refresh_token:{user.id}",
        new_refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(
    response: Response,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Logout and invalidate tokens.

    Clears refresh_token cookie so middleware no longer treats user as authenticated.
    """
    redis = get_redis_client()
    await redis.delete(f"refresh_token:{current_user.id}")

    response.delete_cookie("refresh_token", path="/")

    logger.info("User logged out: %s", current_user.email)

    return {"status": "logged_out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: UserInDB = Depends(get_current_user),
) -> UserResponse:
    """Get current user information."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    request: UserUpdate,
    current_user: UserInDB = Depends(get_current_user),
) -> UserResponse:
    """Update current user profile."""
    db = get_postgres_client()

    update_data = request.model_dump(exclude_unset=True)

    # Check phone uniqueness if updating
    if "phone" in update_data:
        existing = await db.get_user_by_phone(update_data["phone"])
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Phone number already in use")

    updated = await db.update_user(current_user.id, update_data)
    return updated


@router.post("/password/change")
async def change_password(
    request: PasswordChange,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Change password for authenticated user."""
    db = get_postgres_client()

    # Verify current password
    hashed = await db.get_user_password_hash(current_user.id)
    if not verify_password(request.current_password, hashed):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Hash and update new password
    new_hashed = hash_password(request.new_password)
    await db.update_user_password(current_user.id, new_hashed)

    # Invalidate all refresh tokens
    redis = get_redis_client()
    await redis.delete(f"refresh_token:{current_user.id}")

    logger.info("Password changed for user: %s", current_user.email)

    return {"status": "password_changed"}


@router.post("/password/reset")
async def request_password_reset(request: PasswordReset) -> dict[str, str]:
    """Request password reset email."""
    db = get_postgres_client()

    user = await db.get_user_by_email(request.email)
    if not user:
        # Don't reveal if email exists
        return {"status": "reset_email_sent"}

    # Create reset token
    reset_token = str(uuid4())

    redis = get_redis_client()
    await redis.set(
        f"password_reset:{reset_token}",
        user.id,
        ex=60 * 60,  # 1 hour expiry
    )

    # Send password reset email
    email_service = get_email_service()
    await email_service.send_password_reset_email(
        to_email=user.email,
        user_name=user.full_name or user.email.split("@")[0],
        reset_token=reset_token,
    )

    logger.info("Password reset requested for: %s", user.email)

    return {"status": "reset_email_sent"}


@router.post("/password/reset/confirm")
async def confirm_password_reset(request: PasswordResetConfirm) -> dict[str, str]:
    """Confirm password reset with token."""
    redis = get_redis_client()

    user_id = await redis.get(f"password_reset:{request.token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    db = get_postgres_client()

    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Update password
    new_hashed = hash_password(request.new_password)
    await db.update_user_password(user.id, new_hashed)

    # Delete reset token
    await redis.delete(f"password_reset:{request.token}")

    # Invalidate all refresh tokens
    await redis.delete(f"refresh_token:{user.id}")

    logger.info("Password reset completed for: %s", user.email)

    return {"status": "password_reset_complete"}


@router.post("/verify-email/{token}")
async def verify_email(token: str) -> dict[str, str]:
    """Verify email with token."""
    redis = get_redis_client()

    user_id = await redis.get(f"email_verify:{token}")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")

    db = get_postgres_client()
    await db.update_user(user_id, {"is_verified": True})
    await redis.delete(f"email_verify:{token}")

    logger.info("Email verified for user: %s", user_id)

    return {"status": "email_verified"}


@router.post("/resend-verification")
async def resend_verification(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Resend email verification."""
    if current_user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    # Create verification token
    verify_token = str(uuid4())

    redis = get_redis_client()
    await redis.set(
        f"email_verify:{verify_token}",
        current_user.id,
        ex=24 * 60 * 60,  # 24 hour expiry
    )

    # Send verification email
    email_service = get_email_service()
    await email_service.send_verification_email(
        to_email=current_user.email,
        user_name=current_user.full_name or current_user.email.split("@")[0],
        verification_token=verify_token,
    )

    logger.info("Verification email resent to: %s", current_user.email)

    return {"status": "verification_email_sent"}
