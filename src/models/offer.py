"""Offer Pydantic models."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class OfferStatus(str, Enum):
    """Offer status enum."""

    DRAFT = "draft"
    PENDING = "pending"
    MATCHING = "matching"
    MATCHED = "matched"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ServiceCategory(str, Enum):
    """Service category enum."""

    AC_INSTALLATION = "ac_installation"
    KITCHEN = "kitchen"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    PAINTING = "painting"
    FLOORING = "flooring"
    WINDOWS = "windows"
    SECURITY = "security"
    CLEANING = "cleaning"
    RENOVATION = "renovation"


class PricingTier(BaseModel):
    """Pricing tier model."""

    min_participants: int
    max_participants: int
    discount_percent: float
    price_per_unit: float


class OfferBase(BaseModel):
    """Base offer model."""

    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=2000)
    category: ServiceCategory
    base_price: float = Field(..., gt=0)
    min_participants: int = Field(default=5, ge=1)
    max_participants: int = Field(default=50, ge=1)
    deadline: Optional[datetime] = None


class OfferCreate(OfferBase):
    """Create offer request."""

    building_id: str
    created_by: str


class OfferUpdate(BaseModel):
    """Update offer request."""

    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10, max_length=2000)
    base_price: Optional[float] = Field(None, gt=0)
    min_participants: Optional[int] = Field(None, ge=1)
    max_participants: Optional[int] = Field(None, ge=1)
    deadline: Optional[datetime] = None
    status: Optional[OfferStatus] = None


class OfferInDB(OfferBase):
    """Offer stored in database."""

    id: str
    building_id: str
    created_by: str
    status: OfferStatus = OfferStatus.DRAFT
    current_participants: int = 0
    matched_contractor_id: Optional[str] = None
    pricing_tiers: list[PricingTier] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OfferResponse(OfferInDB):
    """Offer response model."""

    contractor_name: Optional[str] = None
    building_name: Optional[str] = None
    current_price: Optional[float] = None
    current_discount: Optional[float] = None


class OfferListResponse(BaseModel):
    """Paginated offer list response."""

    items: list[OfferResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class OfferJoinRequest(BaseModel):
    """Request to join an offer."""

    user_id: str
    unit_count: int = Field(default=1, ge=1)


class OfferMatchRequest(BaseModel):
    """Request to match offer with contractor."""

    contractor_id: str
    final_price: float
    notes: Optional[str] = None
