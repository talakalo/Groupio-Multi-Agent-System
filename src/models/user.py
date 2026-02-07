"""User Pydantic models."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    """User role enum."""

    RESIDENT = "resident"
    CONTRACTOR = "contractor"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class UserBase(BaseModel):
    """Base user model."""

    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., pattern=r"^0\d{8,9}$")
    preferred_language: str = Field(default="he", pattern=r"^(he|en)$")


class UserCreate(UserBase):
    """Create user request."""

    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.RESIDENT


class UserUpdate(BaseModel):
    """Update user request."""

    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^0\d{8,9}$")
    preferred_language: Optional[str] = Field(None, pattern=r"^(he|en)$")
    avatar_url: Optional[str] = None


class UserInDB(UserBase):
    """User stored in database."""

    id: str
    role: UserRole
    is_active: bool = True
    is_verified: bool = False
    avatar_url: Optional[str] = None
    building_id: Optional[str] = None
    contractor_id: Optional[str] = None
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserResponse(UserInDB):
    """User response model (excludes sensitive data)."""

    pass


class UserLogin(BaseModel):
    """Login request."""

    email: EmailStr
    password: str


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
