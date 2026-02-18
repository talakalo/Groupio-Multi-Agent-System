"""Data models for residents and buildings."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class ResidentBase(BaseModel):
    """Base resident fields."""

    name: str
    email: str | None = None
    phone: str | None = None


class ResidentCreate(ResidentBase):
    """Fields required to create a resident."""

    building_id: str


class Resident(ResidentBase):
    """Full resident model."""

    id: str
    building_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"from_attributes": True}


class Building(BaseModel):
    """Building model."""

    id: str
    address: str
    city: str
    region: str
    units: int
    age: int = 0
    building_type: str = "residential"
    coordinates: dict[str, float] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"from_attributes": True}


class BuildingContext(BaseModel):
    """Building context for agent decision-making."""

    building_id: str
    address: str
    city: str
    region: str
    units: int
    building_type: str
    active_offers_count: int = 0
    total_residents: int = 0
    past_projects: list[dict] = Field(default_factory=list)


class UserProfile(BaseModel):
    """User profile assembled from various sources for personalization."""

    user_id: str
    name: str
    building_id: str | None = None
    preferred_language: str = "he"
    preferred_tone: str = "friendly"
    past_interactions_count: int = 0
    offers_joined: int = 0
    complaints_filed: int = 0
    user_value: str = "standard"  # standard, high, vip
    interests: list[str] = Field(default_factory=list)
