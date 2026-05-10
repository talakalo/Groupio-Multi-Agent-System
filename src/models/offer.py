"""Offer Pydantic models."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class OfferStatus(StrEnum):
    """Offer status enum."""

    DRAFT = "draft"
    PENDING = "pending"
    MATCHING = "matching"
    MATCHED = "matched"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ServiceCategory(StrEnum):
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
    pricing_rationale: str | None = None
    created_at: datetime
    updated_at: datetime


class OfferResponse(OfferInDB):
    """Offer response model."""

    contractor_name: str | None = None
    building_name: str | None = None
    current_price: float | None = None
    current_discount: float | None = None
    user_is_participant: bool = False


class OfferListResponse(BaseModel):
    """Paginated offer list response."""

    items: list[OfferResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class OfferJoinRequest(BaseModel):
    """Request to join an offer."""

    user_id: str | None = None
    unit_count: int = Field(default=1, ge=1)
    invite_token: str | None = None


class OfferMatchRequest(BaseModel):
    """Request to match offer with contractor."""

    contractor_id: str
    final_price: float
    notes: str | None = None


# ---------------------------------------------------------------------------
# Agent / data-layer offer models (consolidated from offers.py)
# Used by the pricing, analytics, and outreach agents.
# ---------------------------------------------------------------------------


class AgentPricingTier(BaseModel):
    """Simplified pricing tier used by agents (no strict validation)."""

    min_participants: int
    max_participants: int | None = None
    discount_percent: float
    price: float
    market_position: float = 1.0  # ratio vs market average


class AgentOfferBase(BaseModel):
    """Base offer fields used by agents."""

    category: str
    base_price: float
    building_id: str
    contractor_id: str


class AgentOfferCreate(AgentOfferBase):
    """Fields required to create an offer (agent/internal path)."""

    tiers: list[AgentPricingTier] = Field(default_factory=list)
    expires_in_days: int = 30


class AgentOffer(AgentOfferBase):
    """Full offer model used by agents."""

    id: str
    status: str = "draft"  # draft, active, closed, completed, cancelled
    tiers: list[AgentPricingTier] = Field(default_factory=list)
    current_participants: int = 0
    current_tier_price: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class CompletedOffer(BaseModel):
    """A completed offer with final metrics."""

    id: str
    offer_id: str
    final_price: float
    participants: int
    satisfaction_score: float | None = None
    completed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MarketData(BaseModel):
    """Market pricing data for a category and region."""

    category: str
    region: str
    avg_price: float
    median_price: float
    min_price: float
    max_price: float
    price_stddev: float
    avg_participants: float
    sample_size: int
    period: str = "6_months"


class SeasonalFactor(BaseModel):
    """Seasonal pricing adjustment factor."""

    category: str
    season: str
    factor: float  # multiplier, e.g. 1.15 = 15% increase


SEASONALITY_FACTORS: dict[str, dict[str, float]] = {
    "ac_installation": {"summer": 1.15, "spring": 1.05, "winter": 0.85, "fall": 0.95},
    "ac_maintenance": {"summer": 1.20, "spring": 1.10, "winter": 0.80, "fall": 0.90},
    "heating": {"winter": 1.20, "fall": 1.10, "summer": 0.80, "spring": 0.90},
    "kitchen": {"pre_holidays": 1.10, "summer": 1.05, "winter": 0.95},
    "electrical": {},
    "plumbing": {},
    "renovations": {"spring": 1.10, "summer": 1.05, "winter": 0.90},
}
