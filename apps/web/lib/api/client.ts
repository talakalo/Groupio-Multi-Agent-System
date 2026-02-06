import type { MessageRequest, MessageResponse } from "@groupio/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("auth_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
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

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        errorBody?.detail || response.statusText,
        errorBody
      );
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
    return this.request<{ token: string; user: import("@groupio/types").Resident }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: credentials,
      }
    );
  }

  async signup(data: {
    name: string;
    email: string;
    phone: string;
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
