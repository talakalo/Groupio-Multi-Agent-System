"""Offer Pydantic models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


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
    deadline: datetime | None = None


class OfferCreate(OfferBase):
    """Create offer request."""

    building_id: str
    created_by: str


class OfferUpdate(BaseModel):
    """Update offer request."""

    title: str | None = Field(None, min_length=3, max_length=200)
    description: str | None = Field(None, min_length=10, max_length=2000)
    base_price: float | None = Field(None, gt=0)
    min_participants: int | None = Field(None, ge=1)
    max_participants: int | None = Field(None, ge=1)
    deadline: datetime | None = None
    status: OfferStatus | None = None


class OfferInDB(OfferBase):
    """Offer stored in database."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    building_id: str
    created_by: str
    status: OfferStatus = OfferStatus.DRAFT
    current_participants: int = 0
    matched_contractor_id: str | None = None
    pricing_tiers: list[PricingTier] = []
    created_at: datetime
    updated_at: datetime


class OfferResponse(OfferInDB):
    """Offer response model."""

    contractor_name: str | None = None
    building_name: str | None = None
    current_price: float | None = None
    current_discount: float | None = None


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
    notes: str | None = None
