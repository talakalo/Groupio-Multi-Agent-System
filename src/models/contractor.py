"""Contractor Pydantic models."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

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
    website: Optional[str] = None


class ContractorCreate(ContractorBase):
    """Create contractor request."""

    password: str = Field(..., min_length=8)
    license_number: Optional[str] = None


class ContractorUpdate(BaseModel):
    """Update contractor request."""

    business_name: Optional[str] = Field(None, min_length=2, max_length=200)
    contact_name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^0\d{8,9}$")
    description: Optional[str] = Field(None, min_length=50, max_length=2000)
    categories: Optional[list[ServiceCategory]] = None
    regions: Optional[list[Region]] = None
    years_experience: Optional[int] = Field(None, ge=0)
    employee_count: Optional[int] = Field(None, ge=1)
    website: Optional[str] = None


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

    id: str
    verification_status: VerificationStatus = VerificationStatus.PENDING
    trust_score: float = 0
    trust_score_breakdown: Optional[TrustScoreBreakdown] = None
    license_number: Optional[str] = None
    license_verified: bool = False
    insurance_expiry: Optional[datetime] = None
    insurance_verified: bool = False
    certifications: list[str] = []
    average_rating: float = 0
    total_reviews: int = 0
    completed_projects: int = 0
    response_rate: float = 0
    average_response_time_hours: float = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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

    query: Optional[str] = None
    categories: Optional[list[ServiceCategory]] = None
    regions: Optional[list[Region]] = None
    min_trust_score: Optional[float] = Field(None, ge=0, le=100)
    min_rating: Optional[float] = Field(None, ge=0, le=5)
    verification_status: Optional[VerificationStatus] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ContractorReview(BaseModel):
    """Contractor review model."""

    id: str
    contractor_id: str
    user_id: str
    offer_id: str
    rating: float = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)
    created_at: datetime


class ContractorStats(BaseModel):
    """Contractor statistics."""

    total_offers_received: int = 0
    total_offers_accepted: int = 0
    total_offers_completed: int = 0
    total_revenue: float = 0
    average_project_value: float = 0
    repeat_customer_rate: float = 0
