"""User Pydantic models."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class UserRole(StrEnum):
    """User role enum."""

    RESIDENT = "resident"
    CONTRACTOR = "contractor"
    ADMIN = "admin"
    BUILDINGS_MANAGER = "buildings_manager"
    SUPER_ADMIN = "super_admin"


class UserBase(BaseModel):
    """Base user model."""

    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., pattern=r"^0\d{8,9}$")
    preferred_language: str = Field(default="he", pattern=r"^(he|en)$")


_SELF_REGISTERABLE_ROLES = frozenset({UserRole.RESIDENT, UserRole.CONTRACTOR})


class UserCreate(UserBase):
    """Create user request."""

    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.RESIDENT

    @field_validator("role")
    @classmethod
    def _block_privileged_roles(cls, v: UserRole) -> UserRole:
        if v not in _SELF_REGISTERABLE_ROLES:
            raise ValueError(
                f"Cannot self-register with role '{v}'. Allowed: {', '.join(sorted(_SELF_REGISTERABLE_ROLES))}"
            )
        return v


class UserUpdate(BaseModel):
    """Update user request."""

    full_name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = Field(None, pattern=r"^0\d{8,9}$")
    preferred_language: str | None = Field(None, pattern=r"^(he|en)$")
    avatar_url: str | None = None
    notification_settings: dict[str, bool] | None = None


class UserInDB(UserBase):
    """User stored in database."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    role: UserRole
    is_active: bool = True
    is_verified: bool = False
    avatar_url: str | None = None
    building_id: str | None = None
    contractor_id: str | None = None
    last_login: datetime | None = None
    notification_settings: dict[str, bool] | None = None
    created_at: datetime
    updated_at: datetime


class UserResponse(UserInDB):
    """User response model (excludes sensitive data)."""

    pass


class UserLogin(BaseModel):
    """Login request (email only, for backward compatibility)."""

    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    """Login with email or phone."""

    email: EmailStr | None = None
    phone: str | None = Field(None, pattern=r"^0\d{8,9}$")
    password: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def require_email_or_phone(self) -> "LoginRequest":
        if not self.email and not self.phone:
            raise ValueError("Either email or phone is required")
        if self.email and self.phone:
            raise ValueError("Provide either email or phone, not both")
        return self


class TokenResponse(BaseModel):
    """Authentication token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str  # user_id
    email: str
    role: UserRole
    exp: datetime
    iat: datetime
    jti: str | None = None  # JWT ID — used for token denylist (revocation)


class PasswordReset(BaseModel):
    """Password reset request."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Password reset confirmation."""

    token: str
    new_password: str = Field(..., min_length=8)


class PasswordChange(BaseModel):
    """Password change request."""

    current_password: str
    new_password: str = Field(..., min_length=8)


class UserNotificationSettings(BaseModel):
    """User notification preferences."""

    email_offers: bool = True
    email_updates: bool = True
    sms_offers: bool = True
    sms_updates: bool = False
    whatsapp_offers: bool = True
    whatsapp_updates: bool = True
    push_enabled: bool = True
