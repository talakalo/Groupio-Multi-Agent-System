/**
 * Factory Util — general-purpose test data factories.
 * Creates offers, stats, and mock API responses from centralized test-data.json.
 */

import testData from "../config/test-data.json";

// ─── Offer Factory ──────────────────────────────────────────────────────────

export type OfferStatus = "active" | "completed" | "cancelled" | "expired";

export interface OfferTier {
  min: number;
  max: number;
  discount: number;
  price: number;
}

export interface MockOffer {
  id: string;
  category: string;
  title: string;
  basePrice: number;
  status: OfferStatus;
  contractor: {
    id: string;
    businessName: string;
    rating: number;
    verified: boolean;
    reviewCount?: number;
  };
  participants: number;
  currentParticipants?: number;
  minParticipants?: number;
  maxParticipants?: number;
  currentTier: number;
  discount?: number;
  tiers: OfferTier[];
  expiresAt: string;
  createdAt?: string;
  building?: { id: string; address: string; city: string };
  buildingId?: string;
}

export interface MockStats {
  total_offers: number;
  active_offers: number;
  completed_offers: number;
  average_rating: number;
  total_reviews: number;
}

/** Creates a pilot/smoke offer (minimal, for mocked suites) */
export function createPilotOffer(overrides?: Partial<MockOffer>): MockOffer {
  return { ...testData.offers.pilotOffer, ...overrides } as MockOffer;
}

/** Creates an AC installation offer */
export function createAcOffer(overrides?: Partial<MockOffer>): MockOffer {
  return { ...testData.offers.acInstallation, ...overrides } as MockOffer;
}

/** Creates a kitchen renovation offer */
export function createKitchenOffer(overrides?: Partial<MockOffer>): MockOffer {
  return { ...testData.offers.kitchenRenovation, ...overrides } as MockOffer;
}

/** Returns a default list of offers for mock API responses */
export function createOfferList(overrides?: Partial<MockOffer>[]): MockOffer[] {
  const base: MockOffer[] = [createAcOffer(), createKitchenOffer()];
  if (!overrides) return base;
  return overrides.map((o, i) => ({ ...base[i % base.length], ...o }));
}

/** Creates resident stats mock */
export function createResidentStats(overrides?: Partial<MockStats>): MockStats {
  return { ...testData.stats.residentStats, ...overrides };
}

// ─── Mock Response Factory ───────────────────────────────────────────────────

export interface MockResponse {
  status: number;
  contentType: string;
  body: string;
}

/** Wraps data as a fulfilled Playwright route response */
export function createMockResponse<T>(data: T, status = 200): MockResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

/** Returns a standard health check mock response */
export function createHealthResponse(): MockResponse {
  return createMockResponse(testData.health.healthy);
}

/** Returns an empty list response */
export function createEmptyListResponse(): MockResponse {
  return createMockResponse([]);
}

/** Returns a paginated list mock */
export function createPaginatedResponse<T>(
  items: T[],
  total?: number,
): MockResponse {
  return createMockResponse({
    items,
    total: total ?? items.length,
    page: 1,
    pageSize: items.length,
  });
}
