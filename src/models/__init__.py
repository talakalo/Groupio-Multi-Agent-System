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

# New API models
from src.models.user import (
    User,
    UserCreate,
    UserUpdate,
    UserInDB,
    UserRole,
    TokenResponse,
    TokenPayload,
)
from src.models.offer import (
    OfferStatus,
    ServiceCategory,
    PricingTier as ApiPricingTier,
    OfferBase,
    OfferCreateRequest,
    OfferUpdateRequest,
    OfferResponse,
    OfferListResponse,
    OfferParticipant,
)
from src.models.contractor import (
    Region,
    VerificationStatus,
    TrustScoreBreakdown,
    ContractorBase,
    ContractorRegisterRequest,
    ContractorUpdateRequest,
    ContractorResponse,
    ContractorReview,
    ContractorSearchParams,
)
from src.models.building import (
    BuildingBase,
    BuildingCreateRequest,
    BuildingResponse,
    BuildingResident,
    BuildingInvitation,
    BuildingStats,
)
from src.models.escalation import (
    EscalationPriority,
    EscalationStatus,
    EscalationSource,
    EscalationType,
    EscalationBase,
    EscalationCreateRequest,
    EscalationResponse,
    EscalationResolution,
    EscalationQueueStats,
)

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
    # User models
    "User",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "UserRole",
    "TokenResponse",
    "TokenPayload",
    # Offer API models
    "OfferStatus",
    "ServiceCategory",
    "ApiPricingTier",
    "OfferBase",
    "OfferCreateRequest",
    "OfferUpdateRequest",
    "OfferResponse",
    "OfferListResponse",
    "OfferParticipant",
    # Contractor API models
    "Region",
    "VerificationStatus",
    "TrustScoreBreakdown",
    "ContractorBase",
    "ContractorRegisterRequest",
    "ContractorUpdateRequest",
    "ContractorResponse",
    "ContractorReview",
    "ContractorSearchParams",
    # Building API models
    "BuildingBase",
    "BuildingCreateRequest",
    "BuildingResponse",
    "BuildingResident",
    "BuildingInvitation",
    "BuildingStats",
    # Escalation API models
    "EscalationPriority",
    "EscalationStatus",
    "EscalationSource",
    "EscalationType",
    "EscalationBase",
    "EscalationCreateRequest",
    "EscalationResponse",
    "EscalationResolution",
    "EscalationQueueStats",
]
