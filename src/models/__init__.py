"""Data models for the Groupio Multi-Agent System."""

from src.models.agent_state import AgentState

# API models - Building
from src.models.building import (
    BuildingBase,
    BuildingCreate,
    BuildingResident,
    BuildingResponse,
    BuildingStats,
    BuildingUpdate,
)
from src.models.contractor import (
    AgentContractor as Contractor,
)
from src.models.contractor import (
    AgentContractorCreate as ContractorCreate,
)

# API models - Contractor
from src.models.contractor import (
    ContractorBase,
    ContractorDocument,
    ContractorMatch,
    ContractorProfile,
    ContractorResponse,
    ContractorReview,
    ContractorSearchRequest,
    ContractorUpdate,
    Region,
    TrustScoreBreakdown,
    VerificationStatus,
    VettingResult,
)
from src.models.contractor import (
    ContractorCreate as ApiContractorCreate,
)

# API models - Escalation
from src.models.escalation import (
    EscalationBase,
    EscalationCreate,
    EscalationPriority,
    EscalationReason,
    EscalationResponse,
    EscalationSource,
    EscalationStats,
    EscalationStatus,
    EscalationUpdate,
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
from src.models.offer import (
    AgentOffer as Offer,
)
from src.models.offer import (
    AgentOfferCreate as OfferCreate,
)
from src.models.offer import (
    AgentPricingTier as PricingTier,
)

# API models - Offer
from src.models.offer import (
    CompletedOffer,
    MarketData,
    OfferBase,
    OfferInDB,
    OfferListResponse,
    OfferResponse,
    OfferStatus,
    OfferUpdate,
    ServiceCategory,
)
from src.models.offer import (
    OfferCreate as ApiOfferCreate,
)
from src.models.offer import (
    PricingTier as ApiPricingTier,
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
    TokenPayload,
    TokenResponse,
    UserBase,
    UserCreate,
    UserInDB,
    UserResponse,
    UserRole,
    UserUpdate,
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
