"""Contractor Pydantic models."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.models.offer import ServiceCategory


class Region(StrEnum):
    """Service region enum."""

    CENTER = "center"
    TEL_AVIV = "tel_aviv"
    JERUSALEM = "jerusalem"
    NORTH = "north"
    SOUTH = "south"
    SHARON = "sharon"
    SHFELA = "shfela"
    HAIFA = "haifa"


class VerificationStatus(StrEnum):
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


# ---------------------------------------------------------------------------
# Agent / data-layer contractor models (consolidated from contractors.py)
# These are used by the matching, vetting, and outreach agents.
# ---------------------------------------------------------------------------

class AgentContractorBase(BaseModel):
    """Base contractor fields used by agents and internal services."""

    business_name: str
    license_number: str
    categories: list[str] = Field(default_factory=list)
    regions: list[str] = Field(default_factory=list)
    phone: str | None = None
    email: str | None = None


class AgentContractorCreate(AgentContractorBase):
    """Fields required to create a contractor (agent/internal path)."""

    pass


class AgentContractor(AgentContractorBase):
    """Full contractor model used by agents (simpler than API model)."""

    id: str
    verified: bool = False
    rating: float = 0.0
    active: bool = True
    trust_score: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ContractorProfile(BaseModel):
    """Extended contractor profile for vector storage."""

    contractor_id: str
    business_name: str
    description: str = ""
    specialties: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    past_projects: list[str] = Field(default_factory=list)
    years_in_business: int = 0
    service_area: list[str] = Field(default_factory=list)


class ContractorMatch(BaseModel):
    """A contractor match result with scoring breakdown."""

    contractor_id: str
    business_name: str
    overall_score: float
    semantic_similarity: float = 0.0
    graph_score: float = 0.0
    rating: float = 0.0
    price_competitiveness: float = 0.0
    availability: float = 0.0
    response_time: float = 0.0
    explanation: str = ""
    past_projects_in_building_type: int = 0


class ContractorDocument(BaseModel):
    """A document uploaded by a contractor for vetting."""

    id: str
    contractor_id: str
    doc_type: str  # license, insurance, certificate
    file_url: str
    extracted_text: str | None = None
    verified: bool = False
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class VettingResult(BaseModel):
    """Result of contractor vetting process."""

    contractor_id: str
    trust_score: float
    decision: str  # approved, rejected, manual_review
    license_valid: bool | None = None
    insurance_valid: bool | None = None
    certificates_valid: bool | None = None
    online_reputation_score: float | None = None
    completion_rate: float | None = None
    red_flags: list[str] = Field(default_factory=list)
    notes: str = ""
    reviewed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
