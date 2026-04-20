import type { MessageRequest, MessageResponse, Payment } from "@groupio/types";

import { useAuthStore } from "@/lib/stores/authStore";

/** PERF-9: paginated response envelope for `/payments/my`. */
export interface PaginatedPayments {
  payments: Payment[];
  total: number;
  page: number;
  pages: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// PERF-1: HTTP statuses we transparently retry with exponential backoff + jitter.
// 401 is covered by the access-token-refresh flow inside `_singleRequest` and
// is intentionally absent here so we don't double-retry auth failures.
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 4_000;

/** Callback that tries to refresh the access token; returns new token or null. */
export type On401Retry = () => Promise<string | null>;

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private _on401Retry: On401Retry | null = null;
  /** Single-flight mutex: reuse in-flight refresh so concurrent 401s only call refresh once. */
  private _refreshPromise: Promise<string | null> | null = null;
  /** PERF-1: coalesce concurrent GETs on the same endpoint. Keyed by `endpoint`. */
  private readonly _inflightGets = new Map<string, Promise<unknown>>();

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

  /** 401 on these paths is expected (bad credentials / public auth); do not run token refresh. */
  private isAuthCredentialPath(endpoint: string): boolean {
    return (
      endpoint.startsWith("/api/v1/auth/login") ||
      endpoint.startsWith("/api/v1/auth/signup") ||
      endpoint.startsWith("/api/v1/auth/refresh")
    );
  }

  /**
   * PERF-1: public entry point. Adds transparent exponential-backoff retry on
   * transient statuses (5xx / 429 / 408 / 425 / 529) and coalesces concurrent
   * GETs on the same endpoint so repeated page mounts don't fan out to the
   * backend. Mutations (POST/PUT/PATCH/DELETE) are retried too but are never
   * deduplicated — correctness first.
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const method = options.method ?? "GET";
    if (method === "GET" && !options.signal) {
      const cached = this._inflightGets.get(endpoint);
      if (cached) return cached as Promise<T>;
      const p = this._retryingRequest<T>(endpoint, options).finally(() => {
        this._inflightGets.delete(endpoint);
      });
      this._inflightGets.set(endpoint, p);
      return p;
    }
    return this._retryingRequest<T>(endpoint, options);
  }

  private async _retryingRequest<T>(endpoint: string, options: RequestOptions): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= MAX_RETRY_ATTEMPTS) {
      try {
        return await this._singleRequest<T>(endpoint, options);
      } catch (err) {
        lastErr = err;
        if (!this._isRetryable(err) || attempt === MAX_RETRY_ATTEMPTS) throw err;
        const base = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
        const jitter = Math.random() * base;
        await new Promise((r) => setTimeout(r, base + jitter));
        attempt += 1;
      }
    }
    throw lastErr;
  }

  private _isRetryable(err: unknown): boolean {
    if (err instanceof ApiError) return RETRYABLE_STATUSES.has(err.status);
    // AbortError from user-supplied signals bubbles up as DOMException — don't retry.
    if (err instanceof DOMException && err.name === "AbortError") return false;
    // Network-level failure (fetch reject) is retryable.
    return true;
  }

  private async _singleRequest<T>(
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

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
    let combinedSignal: AbortSignal = timeoutController.signal;
    if (signal) {
      combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include', // send HTTP-only cookies (refresh token)
        signal: combinedSignal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (
      response.status === 401 &&
      this._on401Retry &&
      !isRetry &&
      !this.isAuthCredentialPath(endpoint)
    ) {
      const newToken = await this.refreshToken();
      if (newToken) {
        return this._singleRequest<T>(endpoint, options, true);
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

  async joinOffer(
    offerId: string,
    body: {
      userId?: string;
      unitCount?: number;
      inviteToken?: string | null;
    } = {},
  ) {
    const payload: Record<string, unknown> = {
      unit_count: body.unitCount ?? 1,
    };
    if (body.userId != null) payload.user_id = body.userId;
    if (body.inviteToken) payload.invite_token = body.inviteToken;
    return this.request<{ status: string; offer_id: string }>(
      `/api/v1/offers/${offerId}/join`,
      {
        method: "POST",
        body: payload,
      },
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

  /** Marketplace membership state (contractor only). */
  async getMyContractorMembership() {
    return this.request<Record<string, unknown>>("/api/v1/contractors/me/membership");
  }

  /** Stripe Checkout session for contractor subscription; redirects browser to `url`. */
  async createContractorMembershipCheckoutSession(body?: {
    success_url?: string | null;
    cancel_url?: string | null;
  }) {
    return this.request<{ url: string; session_id: string }>(
      "/api/v1/contractors/me/membership/checkout-session",
      {
        method: "POST",
        body: body ?? {},
      }
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

  /** Request a password reset email (unauthenticated). */
  async requestPasswordReset(email: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/reset", {
      method: "POST",
      body: { email },
    });
  }

  /** Confirm a password reset using the token from the email link. */
  async confirmPasswordReset(token: string, new_password: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/reset/confirm", {
      method: "POST",
      body: { token, new_password },
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ status: string }>("/api/v1/auth/password/change", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    });
  }

  /** PATCH-style merge for profile + notification_settings (server merges notification keys). */
  async updateCurrentUser(body: Record<string, unknown>) {
    return this.request<Record<string, unknown>>("/api/v1/auth/me", {
      method: "PUT",
      body,
    });
  }

  // ---- Payment endpoints ----

  async getMyPayments(opts: { page?: number; limit?: number; status?: string } = {}) {
    const params = new URLSearchParams();
    if (opts.page != null) params.set("page", String(opts.page));
    if (opts.limit != null) params.set("limit", String(opts.limit));
    if (opts.status) params.set("status", opts.status);
    const qs = params.toString();
    return this.request<PaginatedPayments>(`/api/v1/payments/my${qs ? `?${qs}` : ""}`);
  }

  async initiatePayment(offerId: string, paymentMethodId?: string) {
    return this.request<import("@groupio/types").Payment & { provider?: string }>(
      "/api/v1/payments/initiate",
      {
        method: "POST",
        body: { offer_id: offerId, payment_method_id: paymentMethodId },
      }
    );
  }

  async getContractorEarnings() {
    return this.request<{
      currency: string;
      pending_total: number;
      completed_total: number;
      held_escrow_total: number;
      recent: Array<{
        invoice_id: string;
        offer_id: string;
        status: string;
        payment_type: string;
        total: number;
        currency: string;
        created_at: string | null;
        paid_at: string | null;
      }>;
    }>("/api/v1/payments/contractor/earnings");
  }

  async getPayment(paymentId: string) {
    return this.request<import("@groupio/types").Payment>(
      `/api/v1/payments/${paymentId}`
    );
  }

  /** Resident acknowledges completed work (audit log; full escrow release is admin-operated today). */
  async approveWork(paymentId: string) {
    return this.request<{ status: string }>(
      `/api/v1/payments/${encodeURIComponent(paymentId)}/approve-work`,
      { method: "POST" },
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

  /** Download printable invoice HTML (use save as PDF in the browser). Requires auth. */
  async downloadInvoiceHtml(invoiceId: string): Promise<Blob> {
    const token = this.getAuthToken();
    const requestHeaders: Record<string, string> = { Accept: "text/html" };
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/payments/invoices/${encodeURIComponent(invoiceId)}/pdf`,
        {
          method: "GET",
          headers: requestHeaders,
          credentials: "include",
          signal: timeoutController.signal,
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = err?.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((e: { msg?: string }) => e?.msg).filter(Boolean).join(", ") || res.statusText
              : res.statusText;
        throw new ApiError(msg, res.status, err);
      }
      return await res.blob();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Contractor asks ops to review a completed offer (creates an escalation). */
  async requestContractorOfferReview(offerId: string, message?: string) {
    return this.request<{ id: string }>("/api/v1/escalations/contractor/request-review", {
      method: "POST",
      body: { offer_id: offerId, message: message || undefined },
    });
  }

  // ---- Review endpoints ----

  async addContractorReview(
    contractorId: string,
    data: { offer_id: string; rating: number; comment?: string }
  ) {
    return this.request<{ id: string; contractor_id: string; rating: number; comment?: string; created_at: string }>(
      `/api/v1/contractors/${encodeURIComponent(contractorId)}/reviews`,
      { method: "POST", body: data }
    );
  }

  // ---- Offer participants ----

  async getOfferParticipants(offerId: string, params?: { page?: number; page_size?: number }) {
    const search = new URLSearchParams();
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.request<{ items: unknown[]; total: number; page: number; page_size: number }>(
      `/api/v1/offers/${encodeURIComponent(offerId)}/participants${qs ? `?${qs}` : ""}`
    );
  }

  // ---- In-app notifications (API-backed; see also Zustand toast store) ----

  async getNotifications(params?: { limit?: number; offset?: number; unread_only?: boolean }) {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set("limit", String(params.limit));
    if (params?.offset != null) search.set("offset", String(params.offset));
    if (params?.unread_only) search.set("unread_only", "true");
    const qs = search.toString();
    return this.request<{
      items: Array<{
        id: string;
        type: string;
        title: string;
        body: string | null;
        data: Record<string, unknown> | null;
        read: boolean;
        created_at: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/api/v1/notifications${qs ? `?${qs}` : ""}`);
  }

  async getUnreadNotificationCount() {
    return this.request<{ count: number }>("/api/v1/notifications/unread-count");
  }

  async markNotificationRead(notificationId: string) {
    return this.request<{ status: string }>(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST" },
    );
  }

  async markAllNotificationsRead() {
    return this.request<{ status: string }>("/api/v1/notifications/read-all", {
      method: "POST",
    });
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
