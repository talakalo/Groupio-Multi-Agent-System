// ---- Core Entities ----

export interface Resident {
  id: string;
  /** UI / legacy camelCase */
  name: string;
  /** API field (`full_name`); map to `name` when building UI models */
  full_name?: string;
  email: string;
  phone: string;
  buildingId: string;
  createdAt: string;
}

export interface Building {
  id: string;
  address: string;
  city: string;
  region: Region;
  /** Preferred API / analytics field */
  total_units?: number;
  /** Legacy / UI alias; prefer `total_units` when present */
  units: number;
  age: number;
  type: BuildingType;
  coordinates?: { lat: number; lng: number };
  /** Populated by server-side enrichment from data.gov.il settlements API */
  municipality_name?: string;
  municipality_code?: string;
  enrichment_confidence?: number;
  enrichment_source?: string;
}

export interface Contractor {
  id: string;
  businessName: string;
  licenseNumber: string;
  verified: boolean;
  rating: number;
  categories: ServiceCategory[];
  regions: Region[];
  phone?: string;
  email?: string;
  yearsInBusiness?: number;
  description?: string;
  avatar?: string;
  trustScore?: number;
  insuranceExpiry?: string;
  certifications?: string[];
}

export interface Offer {
  id: string;
  category: ServiceCategory;
  basePrice: number;
  status: OfferStatus;
  buildingId: string;
  contractorId: string;
  contractor?: Contractor | null;
  participants: number;
  currentTier: number;
  tiers: PricingTier[];
  createdAt: string;
  expiresAt: string;
  /** Agent-generated explanation; API may expose as snake_case `pricing_rationale` */
  pricingRationale?: string;
}

export interface PricingTier {
  min: number;
  max: number | null;
  discount: number;
  price: number;
  marketPosition?: number;
}

export interface Review {
  id: string;
  contractorId: string;
  residentId: string;
  /** Maps API `user_id` when building from contractor_reviews */
  offerId?: string;
  rating: number;
  /** Preferred UI field */
  text: string;
  /** API / DB column name for the same value */
  comment?: string;
  verified: boolean;
  createdAt: string;
}

// ---- Agent Communication ----

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  intent?: string;
  confidence?: number;
  agentsUsed?: string[];
  responseType?: ResponseType;
  contractors?: ContractorMatch[];
  offers?: Offer[];
  pricingData?: PricingAnalysis;
}

export interface ContractorMatch {
  contractorId: string;
  businessName: string;
  overallScore: number;
  semanticSimilarity: number;
  graphScore: number;
  rating: number;
  description: string;
  /** True when contractor was found active in the data.gov.il company registry */
  govRegistered?: boolean;
}

export interface PricingAnalysis {
  category: ServiceCategory;
  region: Region;
  marketData: MarketData;
  tiers: PricingTier[];
}

export interface MarketData {
  avgPrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  sampleSize: number;
}

// ---- API Types ----

export interface MessageRequest {
  user_id: string;
  message: string;
  building_id?: string;
  channel: Channel;
}

export interface MessageResponse {
  conversationId: string;
  response: AgentResponse;
  metadata: ResponseMetadata;
}

export interface AgentResponse {
  type: ResponseType;
  message: string;
  data?: Record<string, unknown>;
}

export interface ResponseMetadata {
  intent: string | null;
  confidence: number;
  agentsUsed: string[];
  tokensUsed: number;
  durationMs: number;
  needsHuman: boolean;
}

// ---- Contractor Stats ----

export interface ContractorStats {
  activeOffers: number;
  completedProjects: number;
  totalRevenue: number;
  averageRating: number;
  trustScore: number;
  offersTrend?: number;
  projectsTrend?: number;
  revenueTrend?: number;
  trustBreakdown?: {
    license: number;
    insurance: number;
    experience: number;
    reputation: number;
    completion: number;
    response: number;
  };
}

export interface ProjectWithStats {
  id: string;
  offerId: string;
  status: OfferStatus;
  buildingId: string;
  buildingAddress?: string;
  category: ServiceCategory;
  contractorId: string;
  participants: number;
  totalPrice: number;
  startDate?: string;
  completedDate?: string;
  createdAt: string;
  title?: string;
  building?: Building;
  finalPrice?: number;
  participantCount?: number;
}

// ---- Admin Types ----

export interface AgentMetrics {
  name: string;
  calls: number;
  errors: number;
  tokens: number;
  avgDurationMs?: number;
}

export interface Escalation {
  id: string;
  userId: string;
  conversationId: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "assigned" | "resolved";
  context: EscalationContext;
  createdAt: string;
}

export interface EscalationContext {
  intent: string;
  actionsTaken: { agent: string; action: string }[];
  ragSummary?: string;
}

export interface SystemStatus {
  agents: Record<
    string,
    { model: string; calls: number; errors: number; avgDurationMs?: number; tokens?: number }
  >;
  vectorCollections: Record<
    string,
    { pointsCount: number; status: string }
  >;
}

// ---- Enums ----

export type ServiceCategory =
  | "ac_installation"
  | "ac_maintenance"
  | "kitchen"
  | "electrical"
  | "plumbing"
  | "heating"
  | "renovations"
  | "painting"
  | "flooring"
  | "windows"
  | "security";

export type Region =
  | "center"
  | "tel_aviv"
  | "jerusalem"
  | "haifa"
  | "north"
  | "south"
  | "sharon"
  | "shfela";

export type BuildingType = "new_residential" | "old_residential" | "commercial";

export type OfferStatus =
  | "draft"
  | "active"
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export type Channel = "web" | "whatsapp" | "app" | "admin";

export type ResponseType =
  | "text"
  | "contractor_matches"
  | "pricing_analysis"
  | "handoff"
  | "clarification"
  | "error";

// ---- Payment & Financial Types ----

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type InvoiceStatus =
  | "draft"
  | "pending"
  | "paid"
  | "released"
  | "overdue"
  | "cancelled"
  | "refunded";

export type PaymentType = "escrow" | "direct";

export type EscrowStatus =
  | "collecting"
  | "held"
  | "released"
  | "partially_released"
  | "disputed"
  | "refunded";

export type PayoutStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "on_hold";

export interface Payment {
  id: string;
  userId: string;
  offerId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId?: string;
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
  /** API snake_case: provider — mock | stripe | … (initiate responses include this) */
  provider?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber?: string;
  offerId: string;
  contractorId?: string;
  subtotal: number;
  taxRate: number;
  tax: number;
  platformFeeRate: number;
  platformFee: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PaymentSplit {
  id: string;
  invoiceId: string;
  userId: string;
  userName?: string;
  amount: number;
  unitCount: number;
  status: PaymentStatus;
  paidAt?: string;
  createdAt: string;
}

export interface EscrowAccount {
  offerId: string;
  offerTitle?: string;
  contractorId?: string;
  contractorName?: string;
  totalCollected: number;
  totalExpected: number;
  platformFee: number;
  netPayoutAmount: number;
  currency: string;
  escrowStatus: EscrowStatus;
  paymentType: PaymentType;
  participantsPaid: number;
  participantsTotal: number;
  splits?: PaymentSplit[];
  createdAt: string;
}

export interface EscrowConfig {
  minEscrowParticipants: number;
  minEscrowAmount: number;
  trustedContractorThreshold: number;
  highValueCategories: string[];
  platformFeeRate: number;
}


export interface ContractorPayout {
  id: string;
  contractorId: string;
  contractorName: string;
  offerId: string;
  offerTitle?: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: PayoutStatus;
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PaymentSummary {
  totalCollected: number;
  totalInEscrow: number;
  totalReleasedToContractors: number;
  totalPlatformFees: number;
  totalRefunded: number;
  pendingPayouts: number;
  currency: string;
}
