"""Data models for the Groupio Multi-Agent System."""

from src.models.agent_state import AgentState
from src.models.contractors import (
    Contractor,
    ContractorCreate,
    ContractorDocument,
    ContractorMatch,
    ContractorProfile,
    VettingResult,
)
from src.models.messages import (
    AgentAction,
    CampaignMessage,
    ConversationContext,
    Document,
    Message,
    RouterResult,
    SupportTicket,
)
from src.models.offers import (
    CompletedOffer,
    MarketData,
    Offer,
    OfferCreate,
    PricingTier,
)
from src.models.residents import (
    Building,
    BuildingContext,
    Resident,
    ResidentCreate,
    UserProfile,
)

# API models - User
from src.models.user import (
    UserBase,
    UserCreate,
    UserUpdate,
    UserInDB,
    UserResponse,
    UserRole,
    TokenResponse,
    TokenPayload,
)

# API models - Offer
from src.models.offer import (
    OfferStatus,
    ServiceCategory,
    PricingTier as ApiPricingTier,
    OfferBase,
    OfferCreate as ApiOfferCreate,
    OfferUpdate,
    OfferResponse,
    OfferListResponse,
    OfferInDB,
)

# API models - Contractor
from src.models.contractor import (
    Region,
    VerificationStatus,
    TrustScoreBreakdown,
    ContractorBase,
    ContractorCreate as ApiContractorCreate,
    ContractorUpdate,
    ContractorResponse,
    ContractorReview,
    ContractorSearchRequest,
)

# API models - Building
from src.models.building import (
    BuildingBase,
    BuildingCreate,
    BuildingUpdate,
    BuildingResponse,
    BuildingResident,
    BuildingStats,
)

# API models - Escalation
from src.models.escalation import (
    EscalationPriority,
    EscalationStatus,
    EscalationSource,
    EscalationReason,
    EscalationBase,
    EscalationCreate,
    EscalationUpdate,
    EscalationResponse,
    EscalationStats,
)

# Aliases for convenience
User = UserResponse

__all__ = [
    # Core models
    "AgentState",
    "Contractor",
    "ContractorCreate",
    "ContractorDocument",
    "ContractorMatch",
    "ContractorProfile",
    "VettingResult",
    "AgentAction",
    "CampaignMessage",
    "ConversationContext",
    "Document",
    "Message",
    "RouterResult",
    "SupportTicket",
    "CompletedOffer",
    "MarketData",
    "Offer",
    "OfferCreate",
    "PricingTier",
    "Building",
    "BuildingContext",
    "Resident",
    "ResidentCreate",
    "UserProfile",
    # User API models
    "User",
    "UserBase",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "UserResponse",
    "UserRole",
    "TokenResponse",
    "TokenPayload",
    # Offer API models
    "OfferStatus",
    "ServiceCategory",
    "ApiPricingTier",
    "OfferBase",
    "ApiOfferCreate",
    "OfferUpdate",
    "OfferResponse",
    "OfferListResponse",
    "OfferInDB",
    # Contractor API models
    "Region",
    "VerificationStatus",
    "TrustScoreBreakdown",
    "ContractorBase",
    "ApiContractorCreate",
    "ContractorUpdate",
    "ContractorResponse",
    "ContractorReview",
    "ContractorSearchRequest",
    # Building API models
    "BuildingBase",
    "BuildingCreate",
    "BuildingUpdate",
    "BuildingResponse",
    "BuildingResident",
    "BuildingStats",
    # Escalation API models
    "EscalationPriority",
    "EscalationStatus",
    "EscalationSource",
    "EscalationReason",
    "EscalationBase",
    "EscalationCreate",
    "EscalationUpdate",
    "EscalationResponse",
    "EscalationStats",
]
