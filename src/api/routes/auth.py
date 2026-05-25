"""Authentication API routes."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field, field_validator

from src.api.middleware.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_token_jti,
    hash_password,
    verify_password,
    verify_refresh_token,
)
from src.config.settings import get_settings
from src.databases.postgres import get_postgres_client
from src.databases.redis_client import get_redis_client
from src.models.user import (
    SELF_REGISTERABLE_ROLES,
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
    SELF_REGISTERABLE_ROLES,
)
from src.services.email import get_email_service
from src.utils.monitoring import capture_exception_safe, get_logger
from src.utils.security_logger import security_event

logger = get_logger(__name__)

router = APIRouter(tags=["auth"])


async def check_auth_rate_limit(request: Request) -> None:
    """Enforce IP-based rate limit on auth endpoints (20 req/min)."""
    redis = get_redis_client()
    client_ip = request.client.host if request.client else "unknown"
    allowed = await redis.check_ip_rate_limit(client_ip, limit=20, window=60)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many authentication attempts. Try again in a minute.",
            headers={"Retry-After": "60"},
        )


class SignupRequest(BaseModel):
    """Signup request (frontend format: name, buildingId).

    Only self-registerable roles (resident, contractor) are accepted.
    Attempting to claim admin, super_admin, or buildings_manager via public
    signup is rejected with HTTP 422 to prevent privilege escalation.
    """

    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r"^0\d{8,9}$")
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.RESIDENT
    building_id: str | None = Field(None, alias="buildingId")

    model_config = {"populate_by_name": True}

    @field_validator("role")
    @classmethod
    def _block_privileged_roles(cls, v: UserRole) -> UserRole:
        if v not in SELF_REGISTERABLE_ROLES:
            raise ValueError(
                f"Cannot self-register with role '{v}'. "
                f"Allowed: {', '.join(sorted(SELF_REGISTERABLE_ROLES))}"
            )
        return v


class RefreshRequest(BaseModel):
    """Optional body for refresh endpoint (frontend may send refresh_token in JSON)."""

    refresh_token: str | None = None


class SignupResponse(BaseModel):
    """Signup response with token and user (auto-login)."""

    token: str
    user: UserResponse


@router.post("/signup", response_model=SignupResponse)
async def signup(request: SignupRequest, _: None = Depends(check_auth_rate_limit)) -> SignupResponse:
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

    # Auto-create a minimal contractors row so contractor-only endpoints work
    # immediately after signup (before the full onboarding wizard completes).
    if request.role == UserRole.CONTRACTOR:
        from uuid import uuid4 as _uuid4

        contractor_id = str(_uuid4())
        contractor_row = {
            "id": contractor_id,
            "user_id": user_id,
            "business_name": request.name,
            "contact_name": request.name,
            "email": request.email,
            "phone": request.phone,
            "description": "",
            "categories": [],
            "regions": [],
            "years_experience": 0,
            "employee_count": 1,
            "website": None,
            "verification_status": "pending",
            "trust_score": 0.0,
            "license_number": None,
        }
        try:
            if db._use_supabase_client():
                client = await db._get_client()
                await client.table("contractors").insert(contractor_row).execute()
            else:
                await db._pg_execute(
                    """INSERT INTO contractors
                       (id, user_id, business_name, contact_name, email,
                        phone, description, categories, regions,
                        years_experience, employee_count, website,
                        verification_status, trust_score, license_number)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                               $10, $11, $12, $13, $14, $15)""",
                    contractor_row["id"],
                    contractor_row["user_id"],
                    contractor_row["business_name"],
                    contractor_row["contact_name"],
                    contractor_row["email"],
                    contractor_row["phone"],
                    contractor_row["description"],
                    contractor_row["categories"],
                    contractor_row["regions"],
                    contractor_row["years_experience"],
                    contractor_row["employee_count"],
                    contractor_row["website"],
                    contractor_row["verification_status"],
                    contractor_row["trust_score"],
                    contractor_row["license_number"],
                )
            await db.update_user(user_id, {"contractor_id": contractor_id})
            user = await db.get_user(user_id) or user
        except Exception as exc:
            logger.error("Failed to auto-create contractor profile for %s: %s", user_id, exc)

    logger.info("User registered via signup: %s", user.email)

    # Send verification email (if SMTP configured)
    verify_token = str(uuid4())
    redis = get_redis_client()
    await redis.set(
        f"email_verify:{verify_token}",
        user.id,
        ex=24 * 60 * 60,  # 24 hour expiry
    )
    email_service = get_email_service()
    settings = get_settings()
    await email_service.send_verification_email(
        to_email=user.email,
        user_name=user.full_name or user.email.split("@")[0],
        verification_token=verify_token,
        base_url=settings.FRONTEND_URL,
    )

    # Auto-login: create token
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
    settings = get_settings()
    await email_service.send_verification_email(
        to_email=user.email,
        user_name=user.full_name or user.email.split("@")[0],
        verification_token=verify_token,
        base_url=settings.FRONTEND_URL,
    )

    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    http_request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    _: None = Depends(check_auth_rate_limit),
) -> TokenResponse:
    """Login and get access token."""
    db = get_postgres_client()
    redis = get_redis_client()

    user = await db.get_user_by_email(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Verify password
    hashed = await db.get_user_password_hash(user.id)
    if not hashed or not verify_password(form_data.password, hashed):
        # Brute-force lockout: increment failure counter
        _ip = http_request.client.host if http_request.client else None
        fail_count = await redis.increment_login_failures(user.id)
        security_event.failed_login(user.email, ip=_ip)
        if fail_count >= 5:
            await db.update_user(user.id, {"is_active": False})
            logger.warning("Account locked due to too many failed logins: %s", user.email)
            security_event.account_locked(user.email, ip=_ip)
            raise HTTPException(status_code=423, detail="Account locked due to too many failed attempts")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=423, detail="Account is locked")

    settings = get_settings()
    if settings.ENFORCE_EMAIL_VERIFICATION and not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox for the verification link.",
        )

    # Create tokens
    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    # Store refresh token in Redis and clear failure counter
    await redis.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    await redis.clear_login_failures(user.id)

    # Update last login
    await db.update_user(user.id, {"last_login": datetime.now(UTC)})

    # Set refresh token as HTTP-only cookie.
    # secure=False in development so the cookie works over http://localhost.
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    # Set access token as HTTP-only cookie (for admin app; reduces XSS exposure).
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
    http_request: Request,
    request: LoginRequest,
    response: Response,
    _: None = Depends(check_auth_rate_limit),
) -> TokenResponse:
    """Login with JSON body (email or phone)."""
    db = get_postgres_client()
    redis = get_redis_client()

    if request.email:
        user = await db.get_user_by_email(request.email)
    else:
        assert request.phone is not None  # validated by LoginRequest
        user = await db.get_user_by_phone(request.phone)
    if not user:
        ident = (request.email or request.phone or "") or ""
        masked = ident[:3] + "***" if len(ident) > 3 else "***"
        logger.info("Login 401: user not found for identifier=%s", masked)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    lock_ttl = await redis.is_temporarily_locked(user.id)
    if lock_ttl > 0:
        raise HTTPException(
            status_code=423,
            detail="Account temporarily locked due to too many failed attempts",
            headers={"Retry-After": str(lock_ttl)},
        )

    hashed = await db.get_user_password_hash(user.id)
    if not hashed or not verify_password(request.password, hashed):
        _ip = http_request.client.host if http_request.client else None
        fail_count = await redis.increment_login_failures(user.id)
        security_event.failed_login(user.email, ip=_ip)
        if fail_count >= 5:
            lock_seconds = 900
            await redis.set_temporary_lockout(user.id, lock_seconds)
            logger.warning("Temporary lockout after failed logins: %s", user.email)
            security_event.account_temporarily_locked(user.email, ip=_ip)
            raise HTTPException(
                status_code=423,
                detail="Account temporarily locked due to too many failed attempts",
                headers={"Retry-After": str(lock_seconds)},
            )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=423, detail="Account is locked")

    settings = get_settings()
    if settings.ENFORCE_EMAIL_VERIFICATION and not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox for the verification link.",
        )

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )
    refresh_token = create_refresh_token(user_id=user.id)

    await redis.set(
        f"refresh_token:{user.id}",
        refresh_token,
        ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    await redis.clear_login_failures(user.id)
    await redis.clear_temporary_lockout(user.id)

    await db.update_user(user.id, {"last_login": datetime.now(UTC)})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
    if not user_id or not isinstance(user_id, str):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

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
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="strict" if settings.ENVIRONMENT == "production" else "lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
    jti: str | None = Depends(get_token_jti),
) -> dict[str, str]:
    """Logout and invalidate tokens.

    Clears refresh_token cookie and adds access-token JTI to Redis denylist
    so the current bearer token cannot be reused.
    """
    redis = get_redis_client()
    await redis.delete(f"refresh_token:{current_user.id}")

    if jti:
        settings = get_settings()
        await redis.add_token_to_denylist(jti, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("access_token", path="/")

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

    if "notification_settings" in update_data and update_data["notification_settings"] is not None:
        incoming = update_data["notification_settings"]
        if not isinstance(incoming, dict):
            raise HTTPException(status_code=400, detail="notification_settings must be an object")
        existing = dict(current_user.notification_settings or {})
        merged: dict[str, bool] = {**existing}
        for k, v in incoming.items():
            key = str(k)
            if isinstance(v, bool):
                merged[key] = v
            elif isinstance(v, (int, float)) and v in (0, 1):
                merged[key] = bool(v)
        update_data["notification_settings"] = merged

    # Check phone uniqueness if updating
    if "phone" in update_data:
        existing_user = await db.get_user_by_phone(update_data["phone"])
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(status_code=400, detail="Phone number already in use")

    updated = await db.update_user(current_user.id, update_data)
    from src.api.middleware.auth import invalidate_cached_user

    await invalidate_cached_user(current_user.id)
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
    if not hashed or not verify_password(request.current_password, hashed):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Hash and update new password
    new_hashed = hash_password(request.new_password)
    await db.update_user_password(current_user.id, new_hashed)

    # Invalidate all refresh tokens + auth user cache (forces re-fetch of active status)
    redis = get_redis_client()
    await redis.delete(f"refresh_token:{current_user.id}")
    from src.api.middleware.auth import invalidate_cached_user

    await invalidate_cached_user(current_user.id)

    logger.info("Password changed for user: %s", current_user.email)

    return {"status": "password_changed"}


@router.post("/password/reset")
async def request_password_reset(
    http_request: Request,
    request: PasswordReset,
    _: None = Depends(check_auth_rate_limit),
) -> dict[str, str]:
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
    try:
        await email_service.send_password_reset_email(
            to_email=user.email,
            user_name=user.full_name or user.email.split("@")[0],
            reset_token=reset_token,
        )
    except Exception as exc:
        await redis.delete(f"password_reset:{reset_token}")
        logger.error(
            "password_reset_email_send_failed",
            user_id=user.id,
            error_type=type(exc).__name__,
            error=str(exc)[:500],
        )
        capture_exception_safe(exc, flow="password_reset_email")
        raise HTTPException(
            status_code=503,
            detail="Unable to send reset email. Please try again later.",
        ) from exc

    logger.info("password_reset_requested", email=user.email)
    security_event.password_reset_requested(user.email, ip=http_request.client.host if http_request.client else None)

    return {"status": "reset_email_sent"}


@router.post("/password/reset/confirm")
async def confirm_password_reset(request: PasswordResetConfirm) -> dict[str, str]:
    """Confirm password reset with token."""
    redis = get_redis_client()

    user_id = await redis.get(f"password_reset:{request.token}")
    if not user_id:
        logger.warning("password_reset_confirm_invalid_token")
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


class ResendVerificationByEmailRequest(BaseModel):
    """Request to resend verification email by email address (no auth required)."""

    email: EmailStr


@router.post("/resend-verification-by-email")
async def resend_verification_by_email(
    request: ResendVerificationByEmailRequest,
    http_request: Request,
    _: None = Depends(check_auth_rate_limit),
) -> dict[str, str]:
    """Resend verification email by email address. Always returns success to avoid info leak."""
    db = get_postgres_client()
    user = await db.get_user_by_email(request.email)
    if user and not user.is_verified:
        verify_token = str(uuid4())
        redis = get_redis_client()
        await redis.set(
            f"email_verify:{verify_token}",
            user.id,
            ex=24 * 60 * 60,
        )
        email_service = get_email_service()
        settings = get_settings()
        await email_service.send_verification_email(
            to_email=user.email,
            user_name=user.full_name or user.email.split("@")[0],
            verification_token=verify_token,
            base_url=settings.FRONTEND_URL,
        )
        logger.info("Verification email resent to %s (unauthenticated request)", user.email)
    return {"status": "verification_email_sent"}


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
    settings = get_settings()
    await email_service.send_verification_email(
        to_email=current_user.email,
        user_name=current_user.full_name or current_user.email.split("@")[0],
        verification_token=verify_token,
        base_url=settings.FRONTEND_URL,
    )

    logger.info("Verification email resent to: %s", current_user.email)

    return {"status": "verification_email_sent"}


@router.delete("/me")
async def delete_account(
    response: Response,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """GDPR right-to-erasure: permanently delete the authenticated user account.

    Revokes all tokens, anonymises PII in the database, and clears the
    refresh-token cookie so the browser session is immediately invalidated.
    """
    db = get_postgres_client()
    redis = get_redis_client()

    # Revoke refresh token first (prevents any concurrent re-auth)
    await redis.delete(f"refresh_token:{current_user.id}")
    from src.api.middleware.auth import invalidate_cached_user

    await invalidate_cached_user(current_user.id)

    # Delete user — cascade rules in the DB handle linked rows.
    # If the DB client exposes a delete method, use it; otherwise anonymise.
    try:
        await db.delete_user(current_user.id)  # type: ignore[attr-defined]
    except AttributeError:
        # Fallback: anonymise PII if hard-delete is not yet implemented
        anonymised = {
            "email": f"deleted_{current_user.id}@erasure.invalid",
            "full_name": "Deleted User",
            "phone": f"000{current_user.id[:8]}",
            "is_active": False,
        }
        await db.update_user(current_user.id, anonymised)

    # Clear auth cookie
    response.delete_cookie("refresh_token", path="/")

    logger.info("Account deleted (GDPR erasure) for user: %s", current_user.id)

    return {"status": "account_deleted"}


# ---------------------------------------------------------------------------
# Push notification device token registration
# ---------------------------------------------------------------------------


class PushTokenRequest(BaseModel):
    """Request body for registering a push notification device token."""

    token: str = Field(..., min_length=10, description="FCM device registration token")


@router.post("/push-token")
async def register_push_token(
    body: PushTokenRequest,
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Register or update the FCM push notification token for the current user's device."""
    db = get_postgres_client()
    await db.update_user(current_user.id, {"push_token": body.token})
    logger.info("Push token registered for user: %s", current_user.id)
    return {"status": "registered"}


@router.delete("/push-token")
async def unregister_push_token(
    current_user: UserInDB = Depends(get_current_user),
) -> dict[str, str]:
    """Remove the FCM push notification token for the current user."""
    db = get_postgres_client()
    await db.update_user(current_user.id, {"push_token": None})
    return {"status": "unregistered"}
