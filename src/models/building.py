"""Building Pydantic models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from src.models.contractor import Region


class BuildingBase(BaseModel):
    """Base building model."""

    name: str = Field(..., min_length=2, max_length=200)
    address: str = Field(..., min_length=5, max_length=500)
    city: str = Field(..., min_length=2, max_length=100)
    region: Region
    total_units: int = Field(..., ge=1)
    floors: int = Field(..., ge=1)
    year_built: int | None = Field(None, ge=1900, le=2030)


class BuildingCreate(BuildingBase):
    """Create building request."""

    admin_user_id: str


class BuildingUpdate(BaseModel):
    """Update building request."""

    name: str | None = Field(None, min_length=2, max_length=200)
    address: str | None = Field(None, min_length=5, max_length=500)
    total_units: int | None = Field(None, ge=1)
    floors: int | None = Field(None, ge=1)


class BuildingInDB(BuildingBase):
    """Building stored in database."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    admin_user_id: str
    resident_count: int = 0
    active_offers: int = 0
    completed_offers: int = 0
    total_savings: float = 0
    whatsapp_group_id: str | None = None
    created_at: datetime
    updated_at: datetime


class BuildingResponse(BuildingInDB):
    """Building response model."""

    admin_name: str | None = None


class BuildingListResponse(BaseModel):
    """Paginated building list response."""

    items: list[BuildingResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class BuildingResident(BaseModel):
    """Building resident model."""

    id: str
    user_id: str
    building_id: str
    unit_number: str
    floor: int
    is_owner: bool = True
    joined_at: datetime


class BuildingStats(BaseModel):
    """Building statistics."""

    total_residents: int = 0
    participation_rate: float = 0
    total_offers: int = 0
    active_offers: int = 0
    completed_offers: int = 0
    total_savings: float = 0
    average_discount: float = 0
    most_popular_category: str | None = None
