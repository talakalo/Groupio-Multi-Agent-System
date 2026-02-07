// ---- Core Entities ----

export interface Resident {
  id: string;
  name: string;
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
  units: number;
  age: number;
  type: BuildingType;
  coordinates?: { lat: number; lng: number };
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
}

export interface Offer {
  id: string;
  category: ServiceCategory;
  basePrice: number;
  status: OfferStatus;
  buildingId: string;
  contractorId: string;
  contractor: Contractor;
  participants: number;
  currentTier: number;
  tiers: PricingTier[];
  createdAt: string;
  expiresAt: string;
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
  rating: number;
  text: string;
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
  userId: string;
  message: string;
  buildingId?: string;
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
  agents: Record<string, { model: string; calls: number; errors: number }>;
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
  | "windows";

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
