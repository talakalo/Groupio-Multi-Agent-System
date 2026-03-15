import type { MessageRequest, MessageResponse } from "@groupio/types";

import { useAuthStore } from "@/lib/stores/authStore";

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
  private _on401Retry: On401Retry | null = null;
  /** Single-flight mutex: reuse in-flight refresh so concurrent 401s only call refresh once. */
  private _refreshPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      "Content-Type": "application/json",
    };
  }

  /** Set handler for 401: refresh token and return new access token; client will retry once. */
  setOn401Retry(fn: On401Retry | null): void {
    this._on401Retry = fn;
  }

  private async refreshToken(): Promise<string | null> {
    if (this._refreshPromise) {
      return this._refreshPromise; // Reuse in-flight refresh
    }
    this._refreshPromise = this._on401Retry?.() ?? Promise.resolve(null);
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  private getAuthToken(): string | null {
    return useAuthStore.getState().accessToken;
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
      credentials: 'include', // send HTTP-only cookies (refresh token)
      signal,
    });

    if (response.status === 401 && this._on401Retry && !isRetry) {
      const newToken = await this.refreshToken();
      if (newToken) {
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
      throw new ApiError(message, response.status, errorBody);
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

  async getOffers(
    buildingId: string,
    params?: { category?: string; status?: string; page?: number; page_size?: number }
  ) {
    const searchParams = new URLSearchParams();
    searchParams.set("building_id", buildingId);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.page_size != null) searchParams.set("page_size", String(params.page_size));

    return this.request<{
      items: import("@groupio/types").Offer[];
      total: number;
      page: number;
      page_size: number;
      has_more: boolean;
    }>(`/api/v1/offers?${searchParams.toString()}`);
  }

  async createOffer(body: {
    title: string;
    description: string;
    category: string;
    base_price: number;
    min_participants: number;
    max_participants: number;
    deadline?: string | null;
    building_id: string;
  }) {
    return this.request<import("@groupio/types").Offer>("/api/v1/offers", {
      method: "POST",
      body,
    });
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

    return this.request<{ items: import("@groupio/types").Contractor[]; total: number; page: number; page_size: number; has_more: boolean }>(
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

  // ---- File Upload endpoints ----

  async uploadArchitecturePlan(file: File, buildingId: string) {
    const formData = new FormData();
    formData.append("file", file);
    const token = this.getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const url = buildingId
      ? `${this.baseUrl}/api/v1/uploads/architecture?building_id=${encodeURIComponent(buildingId)}`
      : `${this.baseUrl}/api/v1/uploads/architecture`;
    const res = await fetch(url, { method: "POST", headers, body: formData, credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new ApiError(err?.detail || res.statusText, res.status, err);
    }
    return res.json() as Promise<{ id: string; file_name: string; analysis_status: string }>;
  }

  async getFileUpload(fileId: string) {
    return this.request<{
      id: string;
      analysis_status: string;
      analysis_result: unknown;
      [key: string]: unknown;
    }>(`/api/v1/uploads/${fileId}`);
  }

  async getMyUploads(bucket?: string) {
    const params = bucket ? `?bucket=${encodeURIComponent(bucket)}` : "";
    return this.request<{ items: unknown[]; total: number }>(`/api/v1/uploads/${params}`);
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
        body: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          password: data.password,
          role: data.role,
          buildingId: data.buildingId,
        },
      }
    );
  }

  async verifyEmail(token: string) {
    return this.request<{ status: string }>(`/api/v1/auth/verify-email/${encodeURIComponent(token)}`, {
      method: "POST",
    });
  }

  async resendVerificationByEmail(email: string) {
    return this.request<{ status: string }>("/api/v1/auth/resend-verification-by-email", {
      method: "POST",
      body: { email },
    });
  }

  /** Resend verification (requires auth). */
  async resendVerification() {
    return this.request<{ status: string }>("/api/v1/auth/resend-verification", {
      method: "POST",
    });
  }

  // ---- Password Reset endpoints ----

  async requestPasswordReset(email: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/reset", {
      method: "POST",
      body: { email },
    });
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/reset/confirm", {
      method: "POST",
      body: { token, new_password: newPassword },
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/change", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    });
  }

  // ---- Payment endpoints ----

  async getMyPayments() {
    return this.request<import("@groupio/types").Payment[]>("/api/v1/payments/my");
  }

  async initiatePayment(offerId: string, paymentMethodId?: string) {
    return this.request<import("@groupio/types").Payment>("/api/v1/payments/initiate", {
      method: "POST",
      body: { offer_id: offerId, payment_method_id: paymentMethodId },
    });
  }

  async getPayment(paymentId: string) {
    return this.request<import("@groupio/types").Payment>(
      `/api/v1/payments/${paymentId}`
    );
  }

  async getInvoice(invoiceId: string) {
    return this.request<import("@groupio/types").Invoice>(
      `/api/v1/payments/invoices/${invoiceId}`
    );
  }

  async getMyInvoices() {
    return this.request<import("@groupio/types").Invoice[]>("/api/v1/payments/invoices/my");
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
