"""Data models for contractors."""

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class ContractorBase(BaseModel):
    """Base contractor fields."""

    business_name: str
    license_number: str
    categories: list[str] = Field(default_factory=list)
    regions: list[str] = Field(default_factory=list)
    phone: str | None = None
    email: str | None = None


class ContractorCreate(ContractorBase):
    """Fields required to create a contractor."""

    pass


class Contractor(ContractorBase):
    """Full contractor model with computed fields."""

    id: str
    verified: bool = False
    rating: float = 0.0
    active: bool = True
    trust_score: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


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
