import type { MessageRequest, MessageResponse } from "@groupio/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Callback that tries to refresh the access token; returns new token or null. */
export type On401Retry = () => Promise<string | null>;

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private on401Retry: On401Retry | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  /** Set handler for 401: refresh token and return new access token; client will retry the request once. */
  setOn401Retry(fn: On401Retry | null): void {
    this.on401Retry = fn;
  }

  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
  }

  private setAuthToken(token: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    isRetry = false
  ): Promise<T> {
    const { method = "GET", body, headers = {}, signal } = options;

    const token = this.getAuthToken();
    const requestHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...headers,
    };

    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (response.status === 401 && this.on401Retry && !isRetry) {
      const newToken = await this.on401Retry();
      if (newToken) {
        this.setAuthToken(newToken);
        return this.request<T>(endpoint, options, true);
      }
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const detail = errorBody?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((e: { msg?: string }) => e?.msg).filter(Boolean).join(", ") || response.statusText
            : response.statusText;
      throw new ApiError(response.status, message, errorBody);
    }

    return response.json();
  }

  // ---- Chat / Message endpoints ----

  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    return this.request<MessageResponse>("/api/v1/message", {
      method: "POST",
      body: request,
    });
  }

  // ---- Offers endpoints ----

  async getOffers(buildingId: string, params?: { category?: string; status?: string }) {
    const searchParams = new URLSearchParams();
    searchParams.set("building_id", buildingId);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.status) searchParams.set("status", params.status);

    return this.request<{ offers: import("@groupio/types").Offer[] }>(
      `/api/v1/offers?${searchParams.toString()}`
    );
  }

  async getOffer(offerId: string) {
    return this.request<import("@groupio/types").Offer>(
      `/api/v1/offers/${offerId}`
    );
  }

  async joinOffer(offerId: string, userId: string) {
    return this.request<{ success: boolean; participants: number }>(
      `/api/v1/offers/${offerId}/join`,
      {
        method: "POST",
        body: { userId },
      }
    );
  }

  // ---- Contractor endpoints ----

  async getContractors(params?: { category?: string; region?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set("category", params.category);
    if (params?.region) searchParams.set("region", params.region);

    return this.request<{ contractors: import("@groupio/types").Contractor[] }>(
      `/api/v1/contractors?${searchParams.toString()}`
    );
  }

  async getContractor(contractorId: string) {
    return this.request<import("@groupio/types").Contractor>(
      `/api/v1/contractors/${contractorId}`
    );
  }

  // ---- Building endpoints ----

  async getBuilding(buildingId: string) {
    return this.request<import("@groupio/types").Building>(
      `/api/v1/buildings/${buildingId}`
    );
  }

  // ---- Auth endpoints ----

  async login(credentials: { email?: string; phone?: string; password: string }) {
    const data = await this.request<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    }>("/api/v1/auth/login/json", {
      method: "POST",
      body: credentials,
    });
    return { token: data.access_token, ...data };
  }

  async signup(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: "resident" | "contractor";
    buildingId?: string;
  }) {
    return this.request<{ token: string; user: import("@groupio/types").Resident }>(
      "/api/v1/auth/signup",
      {
        method: "POST",
        body: data,
      }
    );
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
