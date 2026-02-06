import Constants from "expo-constants";
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
} from "@groupio/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL: string =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  "https://api.groupio.co.il/v1";

// ---------------------------------------------------------------------------
// Auth token storage (in-memory; swap for SecureStore in production)
// ---------------------------------------------------------------------------

let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

export function getAuthToken(): string | null {
  return _authToken;
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
  const url = new URL(path, API_BASE_URL);

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

    throw new ApiError(
      (errorBody.message as string) ?? response.statusText,
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
): Promise<{ success: boolean; participants: number }> {
  return request<{ success: boolean; participants: number }>(
    "POST",
    `/offers/${offerId}/join`,
  );
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
  return request<ProfileResponse>("GET", "/profile", { signal });
}

/** Update the current user's profile. */
export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<ProfileResponse> {
  return request<ProfileResponse>("PATCH", "/profile", { body: payload });
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

  const url = buildUrl("/profile/avatar");
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
  return request<MessageResponse>("POST", "/chat", {
    body: payload,
    signal,
  });
}

/**
 * Send a chat message with streaming support.
 * Yields partial tokens as they arrive from the server (SSE).
 */
export async function* sendMessageStream(
  payload: MessageRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const url = buildUrl("/chat/stream");

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
