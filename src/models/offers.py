"""Data models for offers and pricing."""

from datetime import datetime

from pydantic import BaseModel, Field


class PricingTier(BaseModel):
    """A single pricing tier within an offer."""

    min_participants: int
    max_participants: int | None = None
    discount_percent: float
    price: float
    market_position: float = 1.0  # ratio vs market average


class OfferBase(BaseModel):
    """Base offer fields."""

    category: str
    base_price: float
    building_id: str
    contractor_id: str


class OfferCreate(OfferBase):
    """Fields required to create an offer."""

    tiers: list[PricingTier] = Field(default_factory=list)
    expires_in_days: int = 30


class Offer(OfferBase):
    """Full offer model."""

    id: str
    status: str = "draft"  # draft, active, closed, completed, cancelled
    tiers: list[PricingTier] = Field(default_factory=list)
    current_participants: int = 0
    current_tier_price: float | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class CompletedOffer(BaseModel):
    """A completed offer with final metrics."""

    id: str
    offer_id: str
    final_price: float
    participants: int
    satisfaction_score: float | None = None
    completed_at: datetime = Field(default_factory=datetime.utcnow)


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
