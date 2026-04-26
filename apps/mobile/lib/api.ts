import type {
  Offer,
  Contractor,
  Resident,
  Building,
  ServiceCategory,
  Region,
  OfferStatus,
  MessageRequest,
  MessageResponse,
  ContractorMatch,
  ContractorStats,
  ProjectWithStats,
} from "@groupio/types";
import Constants from "expo-constants";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL: string =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://api.groupio.co.il/api/v1";

// ---------------------------------------------------------------------------
// Auth token storage — backed by expo-secure-store for persistence.
// Call loadAuthToken() once on app start to restore session from secure storage.
// ---------------------------------------------------------------------------

import { secureStorage } from './storage';

let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
}

/**
 * Restore the access token from SecureStore on app launch.
 * Call this in the root layout before rendering authenticated screens.
 */
export async function loadAuthToken(): Promise<string | null> {
  const stored = await secureStorage.getAuth();
  if (stored && stored.expiresAt > Date.now()) {
    _authToken = stored.accessToken;
    return _authToken;
  }
  _authToken = null;
  return null;
}

/**
 * Persist a new auth session to SecureStore and update the in-memory token.
 */
export async function saveAuthSession(
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
): Promise<void> {
  _authToken = accessToken;
  await secureStorage.setAuth({
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  });
}

/**
 * Clear auth from memory and SecureStore (logout).
 */
export async function clearAuthSession(): Promise<void> {
  _authToken = null;
  await secureStorage.clearAuth();
}

/**
 * Login with email/phone + password. Persists tokens to SecureStore.
 */
/** Request password reset email (unauthenticated). */
export async function requestPasswordReset(email: string): Promise<void> {
  await request<{ status: string }>("POST", "/auth/password/reset", {
    body: { email: email.trim().toLowerCase() },
  });
}

/** Confirm a password reset using the emailed token (unauthenticated). */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  await request<{ status: string }>("POST", "/auth/password/reset/confirm", {
    body: { token, new_password: newPassword },
  });
}

/** Join a building via an invite code (resident, post-signup or after-signup). */
export async function joinBuilding(inviteCode: string): Promise<void> {
  await request<{ status: string; building_id?: string }>(
    "POST",
    "/buildings/join",
    { body: { invite_code: inviteCode } },
  );
}

export async function login(credentials: {
  email?: string;
  phone?: string;
  password: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const data = await request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>("POST", "/auth/login/json", { body: credentials });
  await saveAuthSession(data.access_token, data.refresh_token, data.expires_in);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ---------------------------------------------------------------------------
// Types – request / response shapes specific to the mobile client
// ---------------------------------------------------------------------------

export interface OffersFilters {
  category?: ServiceCategory;
  status?: OfferStatus;
  buildingId?: string;
  page?: number;
  limit?: number;
}

export interface ContractorsFilters {
  category?: ServiceCategory;
  region?: Region;
  minRating?: number;
  verified?: boolean;
  query?: string;
  page?: number;
  limit?: number;
}

export interface CreateOfferPayload {
  category: ServiceCategory;
  buildingId: string;
  contractorId: string;
  basePrice: number;
  tiers: { min: number; max: number | null; discount: number; price: number }[];
  expiresAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
  phone?: string;
  buildingId?: string;
  language?: "he" | "en";
  notificationsEnabled?: boolean;
  pushToken?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ProfileResponse extends Resident {
  building: Building;
  language: string;
  notificationsEnabled: boolean;
  avatar?: string;
}

export interface ChatStreamEvent {
  type: "token" | "done" | "error";
  content: string;
  metadata?: MessageResponse["metadata"];
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };

  if (_authToken) {
    headers["Authorization"] = `Bearer ${_authToken}`;
  }

  return headers;
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  // Concatenate base + path so that API_BASE_URL (e.g. .../api/v1) is preserved.
  // new URL(path, base) would replace the path when path is absolute.
  const base = API_BASE_URL.replace(/\/$/, "");
  const pathPart = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${pathPart}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options?: {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<T> {
  const url = buildUrl(path, options?.params);

  const response = await fetch(url, {
    method,
    headers: buildHeaders(options?.headers),
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = (await response.json()) as Record<string, unknown>;
    } catch {
      // ignore parse failures on error bodies
    }

    const detail = errorBody.detail;
    const detailStr =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((e: { msg?: string }) => e?.msg)
              .filter(Boolean)
              .join(", ")
          : undefined;
    throw new ApiError(
      detailStr ?? (errorBody.message as string) ?? response.statusText,
      response.status,
      (errorBody.code as string) ?? "UNKNOWN_ERROR",
      errorBody,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API methods
// ---------------------------------------------------------------------------

/** Fetch a paginated list of offers with optional filters. */
export async function getOffers(
  filters?: OffersFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Offer>> {
  return request<PaginatedResponse<Offer>>("GET", "/offers", {
    params: filters as Record<string, string | number | boolean | undefined>,
    signal,
  });
}

/** Fetch a single offer by ID. */
export async function getOffer(
  id: string,
  signal?: AbortSignal,
): Promise<Offer> {
  return request<Offer>("GET", `/offers/${id}`, { signal });
}

/** Create a new group offer. */
export async function createOffer(
  payload: CreateOfferPayload,
): Promise<Offer> {
  return request<Offer>("POST", "/offers", { body: payload });
}

/** Join an existing group offer. */
export async function joinOffer(
  offerId: string,
): Promise<{ status: string; offer_id: string }> {
  return request<{ status: string; offer_id: string }>("POST", `/offers/${offerId}/join`, {
    body: { unit_count: 1 },
  });
}

/** Fetch contractors with optional filters. */
export async function getContractors(
  filters?: ContractorsFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Contractor>> {
  return request<PaginatedResponse<Contractor>>("GET", "/contractors", {
    params: filters as Record<string, string | number | boolean | undefined>,
    signal,
  });
}

/** Fetch contractor matches from the AI agent. */
export async function getContractorMatches(
  category: ServiceCategory,
  buildingId: string,
  signal?: AbortSignal,
): Promise<ContractorMatch[]> {
  return request<ContractorMatch[]>("GET", "/contractors/matches", {
    params: { category, buildingId },
    signal,
  });
}

/** Fetch the current user's profile. */
export async function getProfile(
  signal?: AbortSignal,
): Promise<ProfileResponse> {
  return request<ProfileResponse>("GET", "/auth/me", { signal });
}

/** Update the current user's profile. */
export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<ProfileResponse> {
  return request<ProfileResponse>("PUT", "/auth/me", { body: payload });
}

/** Upload a profile avatar (multipart). */
export async function uploadAvatar(
  uri: string,
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  const filename = uri.split("/").pop() ?? "avatar.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("avatar", {
    uri,
    name: filename,
    type,
  } as unknown as Blob);

  const url = buildUrl("/auth/me/avatar");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (_authToken) {
    headers["Authorization"] = `Bearer ${_authToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError("Failed to upload avatar", response.status, "UPLOAD_ERROR");
  }

  return response.json() as Promise<{ avatarUrl: string }>;
}

/** Send a chat message and receive a full response. */
export async function sendMessage(
  payload: MessageRequest,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  return request<MessageResponse>("POST", "/message", {
    body: payload,
    signal,
  });
}

/**
 * Send a chat message with streaming support.
 * Yields partial tokens as they arrive from the server (SSE).
 * Note: Backend may not implement /message/stream; handle 404 or use sendMessage.
 */
export async function* sendMessageStream(
  payload: MessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const url = buildUrl("/message/stream");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...buildHeaders(),
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new ApiError(
      "Stream request failed",
      response.status,
      "STREAM_ERROR",
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError("No response body", 0, "NO_BODY");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield { type: "done", content: "" };
          return;
        }

        try {
          const parsed = JSON.parse(data) as ChatStreamEvent;
          yield parsed;
        } catch {
          // skip malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Fetch activity feed for the home screen. */
export async function getActivityFeed(
  buildingId: string,
  limit?: number,
  signal?: AbortSignal,
): Promise<ActivityItem[]> {
  return request<ActivityItem[]>("GET", "/activity", {
    params: { buildingId, limit },
    signal,
  });
}

export interface ActivityItem {
  id: string;
  type: "offer_created" | "offer_joined" | "offer_completed" | "new_review" | "building_update";
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
  offerId?: string;
  icon?: string;
}

// ---------------------------------------------------------------------------
// Auth – signup & verify
// ---------------------------------------------------------------------------

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  role: "resident" | "contractor";
}

export interface SignupResponse {
  userId: string;
  email: string;
  requiresVerification: boolean;
}

export async function signup(payload: SignupPayload): Promise<SignupResponse> {
  return request<SignupResponse>("POST", "/auth/register", { body: payload });
}

export async function resendVerification(email: string): Promise<void> {
  // Backend has TWO endpoints:
  //   /auth/resend-verification           — requires auth (logged-in user)
  //   /auth/resend-verification-by-email  — unauthenticated, takes email body
  // The mobile flow always reaches this from an unauthenticated screen
  // (verify-email, signup completion), so the public endpoint is correct.
  return request<void>("POST", "/auth/resend-verification-by-email", {
    body: { email: email.trim().toLowerCase() },
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  offerId: string;
  offerTitle: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
  amount: number;
  createdAt: string;
  updatedAt: string;
  contractorName: string;
  contractorId: string;
  category: ServiceCategory;
  timeline?: OrderTimelineEvent[];
  paymentStatus: "pending" | "escrow" | "released" | "refunded";
}

export interface OrderTimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  status: "completed" | "current" | "upcoming";
}

export async function getOrders(
  signal?: AbortSignal,
): Promise<PaginatedResponse<Order>> {
  return request<PaginatedResponse<Order>>("GET", "/orders", { signal });
}

export async function getOrder(
  id: string,
  signal?: AbortSignal,
): Promise<Order> {
  return request<Order>("GET", `/orders/${id}`, { signal });
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutPayload {
  offerId: string;
  tierId: number;
}

export interface CheckoutResponse {
  orderId: string;
  paymentUrl?: string;
  status: "success" | "requires_payment";
}

export async function createCheckout(
  payload: CheckoutPayload,
): Promise<CheckoutResponse> {
  return request<CheckoutResponse>("POST", "/checkout", { body: payload });
}

// ---------------------------------------------------------------------------
// Building detail
// ---------------------------------------------------------------------------

export interface BuildingDetail {
  id: string;
  name: string;
  address: string;
  inviteCode: string;
  memberCount: number;
  activeOffers: number;
}

export async function getBuildingDetail(
  buildingId: string,
  signal?: AbortSignal,
): Promise<BuildingDetail> {
  return request<BuildingDetail>("GET", `/buildings/${buildingId}`, { signal });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  status: "pending" | "completed" | "refunded" | "failed";
  method: string;
  createdAt: string;
  description: string;
}

export async function getPayments(
  signal?: AbortSignal,
): Promise<PaginatedResponse<PaymentRecord>> {
  return request<PaginatedResponse<PaymentRecord>>("GET", "/payments", {
    signal,
  });
}

/** Fetch building news / announcements. */
export async function getBuildingNews(
  buildingId: string,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  return request<NewsItem[]>("GET", `/buildings/${buildingId}/news`, { signal });
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  category: "maintenance" | "general" | "offer" | "community";
  createdAt: string;
  author?: string;
}

// ---------------------------------------------------------------------------
// Contractor API
// ---------------------------------------------------------------------------

/** Fetch stats for the currently authenticated contractor. */
export async function getContractorStats(
  signal?: AbortSignal,
): Promise<ContractorStats> {
  return request<ContractorStats>("GET", "/contractors/me/stats", { signal });
}

/** Fetch offers belonging to the authenticated contractor. */
export async function getContractorOffers(
  filters?: ContractorOffersFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Offer>> {
  return request<PaginatedResponse<Offer>>("GET", "/contractors/me/offers", {
    params: filters as Record<string, string | number | boolean | undefined>,
    signal,
  });
}

/** Fetch projects for the authenticated contractor. */
export async function getContractorProjects(
  filters?: ContractorProjectsFilters,
  signal?: AbortSignal,
): Promise<PaginatedResponse<ProjectWithStats>> {
  return request<PaginatedResponse<ProjectWithStats>>(
    "GET",
    "/contractors/me/projects",
    {
      params: filters as Record<string, string | number | boolean | undefined>,
      signal,
    },
  );
}

export interface ContractorOffersFilters {
  status?: OfferStatus;
  page?: number;
  limit?: number;
}

export interface ContractorProjectsFilters {
  status?: OfferStatus;
  page?: number;
  limit?: number;
}
