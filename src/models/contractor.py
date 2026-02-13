"""Contractor Pydantic models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.offer import ServiceCategory


class Region(str, Enum):
    """Service region enum."""

    CENTER = "center"
    TEL_AVIV = "tel_aviv"
    JERUSALEM = "jerusalem"
    NORTH = "north"
    SOUTH = "south"
    SHARON = "sharon"
    SHFELA = "shfela"
    HAIFA = "haifa"


class VerificationStatus(str, Enum):
    """Contractor verification status."""

    PENDING = "pending"
    VERIFIED = "verified"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class ContractorBase(BaseModel):
    """Base contractor model."""

    business_name: str = Field(..., min_length=2, max_length=200)
    contact_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., pattern=r"^0\d{8,9}$")
    description: str = Field(..., min_length=50, max_length=2000)
    categories: list[ServiceCategory] = Field(..., min_length=1)
    regions: list[Region] = Field(..., min_length=1)
    years_experience: int = Field(..., ge=0)
    employee_count: int = Field(..., ge=1)
    website: str | None = None


class ContractorCreate(ContractorBase):
    """Create contractor request."""

    password: str = Field(..., min_length=8)
    license_number: str | None = None


class ContractorUpdate(BaseModel):
    """Update contractor request."""

    business_name: str | None = Field(None, min_length=2, max_length=200)
    contact_name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = Field(None, pattern=r"^0\d{8,9}$")
    description: str | None = Field(None, min_length=50, max_length=2000)
    categories: list[ServiceCategory] | None = None
    regions: list[Region] | None = None
    years_experience: int | None = Field(None, ge=0)
    employee_count: int | None = Field(None, ge=1)
    website: str | None = None


class TrustScoreBreakdown(BaseModel):
    """Trust score component breakdown."""

    license_score: float = 0  # Max 25
    insurance_score: float = 0  # Max 20
    experience_score: float = 0  # Max 15
    reputation_score: float = 0  # Max 15
    completion_score: float = 0  # Max 15
    response_score: float = 0  # Max 10
    total: float = 0


class ContractorInDB(ContractorBase):
    """Contractor stored in database."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    verification_status: VerificationStatus = VerificationStatus.PENDING
    trust_score: float = 0
    trust_score_breakdown: TrustScoreBreakdown | None = None
    license_number: str | None = None
    license_verified: bool = False
    insurance_expiry: datetime | None = None
    insurance_verified: bool = False
    certifications: list[str] = []
    average_rating: float = 0
    total_reviews: int = 0
    completed_projects: int = 0
    response_rate: float = 0
    average_response_time_hours: float = 0
    created_at: datetime
    updated_at: datetime


class ContractorResponse(ContractorInDB):
    """Contractor response model."""

    pass


class ContractorListResponse(BaseModel):
    """Paginated contractor list response."""

    items: list[ContractorResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class ContractorSearchRequest(BaseModel):
    """Contractor search request."""

    query: str | None = None
    categories: list[ServiceCategory] | None = None
    regions: list[Region] | None = None
    min_trust_score: float | None = Field(None, ge=0, le=100)
    min_rating: float | None = Field(None, ge=0, le=5)
    verification_status: VerificationStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ContractorReview(BaseModel):
    """Contractor review model."""

    id: str
    contractor_id: str
    user_id: str
    offer_id: str
    rating: float = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=1000)
    created_at: datetime


class ContractorStats(BaseModel):
    """Contractor statistics."""

    total_offers_received: int = 0
    total_offers_accepted: int = 0
    total_offers_completed: int = 0
    total_revenue: float = 0
    average_project_value: float = 0
    repeat_customer_rate: float = 0
