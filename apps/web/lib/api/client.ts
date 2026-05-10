import type {
  Contractor,
  ContractorStats,
  MessageRequest,
  MessageResponse,
  Payment,
} from "@groupio/types";

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

// PERF-1: network-level (fetch reject) failures are transparently retried
// with exponential backoff + jitter. HTTP-level errors (4xx/5xx) are NOT
// retried here — they surface to the caller so the UI / react-query layer
// can decide (explicit retry buttons, react-query `retry: 2`, etc.). This
// keeps client-level retry safe for both idempotent GETs and side-effecting
// POSTs, and avoids silently masking server errors that tests and UIs
// depend on observing.
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

  /**
   * Test-only: reset in-flight GET dedup map and any pending refresh promise.
   * The client is a module-level singleton; without this, a never-resolving
   * mocked fetch in one test can poison subsequent tests that hit the same
   * endpoint (they'd receive the stale pending Promise from `_inflightGets`).
   */
  __resetInternalsForTests(): void {
    this._inflightGets.clear();
    this._refreshPromise = null;
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
    // PERF-1: do NOT retry HTTP-level errors; let the caller decide.
    if (err instanceof ApiError) return false;
    // AbortError from user-supplied signals bubbles up as DOMException — don't retry.
    if (err instanceof DOMException && err.name === "AbortError") return false;
    // Network-level failure (fetch reject) — retry transparently.
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

    // FormData / Blob / URLSearchParams must NOT be JSON-stringified, and
    // we must NOT force Content-Type to application/json — fetch lets the
    // browser pick the right boundary for multipart bodies.
    const isMultipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    const isBinary =
      typeof Blob !== "undefined" && body instanceof Blob;
    const isUrlEncoded =
      typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams;
    if (isMultipart || isBinary || isUrlEncoded) {
      delete requestHeaders["Content-Type"];
      delete requestHeaders["content-type"];
    }

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
      const fetchBody: BodyInit | undefined = body
        ? isMultipart || isBinary || isUrlEncoded
          ? (body as BodyInit)
          : JSON.stringify(body)
        : undefined;
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: fetchBody,
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

  /** When `buildingId` is omitted, the backend scopes offers by the authenticated user's role (e.g. contractor-wide listing). */
  async getOffers(
    buildingId?: string | null,
    params?: { category?: string; status?: string; page?: number; page_size?: number }
  ) {
    const searchParams = new URLSearchParams();
    if (buildingId) searchParams.set("building_id", buildingId);
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
    pricing_tiers?: Array<{ min_participants: number; price_per_unit: number }>;
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

  /** Building scoped to the current authenticated user. */
  async getMyBuilding() {
    return this.request<import("@groupio/types").Building>(
      `/api/v1/buildings/me`
    );
  }

  /** Recent activity feed (payments, escalations, etc.) for the current user. */
  async getRecentActivity() {
    return this.request<{ items: Array<Record<string, unknown>> }>(
      `/api/v1/activity/recent`
    );
  }

  /** Upload an avatar. Caller hands a Blob/File which becomes a multipart body. */
  async uploadAvatar(file: Blob, filename = "avatar"): Promise<{ avatar_url: string }> {
    const form = new FormData();
    form.append("file", file, filename);
    return this.request<{ avatar_url: string }>(`/api/v1/uploads/avatar`, {
      method: "POST",
      body: form,
      // Do not set Content-Type — the browser will add the multipart boundary.
    });
  }

  /** Fetch the current authenticated user's profile (`GET /auth/me`). */
  async getMe() {
    return this.request<Record<string, unknown>>(`/api/v1/auth/me`);
  }

  /** GDPR deletion of the current user (`DELETE /auth/me`). */
  async deleteAccount() {
    return this.request<{ status: string }>(`/api/v1/auth/me`, {
      method: "DELETE",
    });
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

  /** List buildings (paginated). */
  async listBuildings(params?: { page?: number; page_size?: number }) {
    const search = new URLSearchParams();
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.request<{ items: Array<Record<string, unknown>>; total: number }>(
      `/api/v1/buildings${qs ? `?${qs}` : ""}`,
    );
  }

  /** List escalations with optional status filter (paginated). */
  async listEscalations(params?: { status?: string; page?: number; page_size?: number }) {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.request<{ items: Array<Record<string, unknown>>; total: number }>(
      `/api/v1/escalations${qs ? `?${qs}` : ""}`,
    );
  }

  /** Mark an escalation resolved with an optional resolution note. */
  async resolveEscalation(escalationId: string, body: Record<string, unknown> = {}) {
    return this.request<{ status: string }>(
      `/api/v1/escalations/${encodeURIComponent(escalationId)}/resolve`,
      { method: "POST", body },
    );
  }

  /** Update a contractor profile (PUT /contractors/{id}). */
  async updateContractor(contractorId: string, body: Record<string, unknown>) {
    return this.request<Contractor>(
      `/api/v1/contractors/${encodeURIComponent(contractorId)}`,
      { method: "PUT", body },
    );
  }

  /** Upload a contractor document (license, insurance, etc.). */
  async uploadContractorDoc(file: Blob, filename = "doc"): Promise<Record<string, unknown>> {
    const form = new FormData();
    form.append("file", file, filename);
    return this.request<Record<string, unknown>>(`/api/v1/uploads/contractor-docs`, {
      method: "POST",
      body: form,
    });
  }

  /** Pending document requests sent to the current contractor. */
  async getMyContractorDocRequests() {
    return this.request<{
      pending: boolean;
      items: Array<{ message?: string; requested_at?: string }>;
    }>(`/api/v1/contractors/me/doc-requests`);
  }

  /** Aggregate stats for a contractor (active offers, completed jobs, revenue, …). */
  async getContractorStats(contractorId: string): Promise<ContractorStats> {
    const raw = await this.request<Record<string, unknown>>(
      `/api/v1/contractors/${encodeURIComponent(contractorId)}/stats`,
    );
    const num = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const optNum = (v: unknown): number | undefined => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      activeOffers: num(raw.active_offers ?? raw.activeOffers),
      completedProjects: num(raw.completed_projects ?? raw.completedProjects),
      totalRevenue: num(raw.total_revenue ?? raw.totalRevenue),
      averageRating: num(raw.average_rating ?? raw.averageRating),
      trustScore: num(raw.trust_score ?? raw.trustScore),
      offersTrend: optNum(raw.offers_trend ?? raw.offersTrend),
      projectsTrend: optNum(raw.projects_trend ?? raw.projectsTrend),
      revenueTrend: optNum(raw.revenue_trend ?? raw.revenueTrend),
      trustBreakdown: (() => {
        const tb = raw.trust_breakdown ?? raw.trustBreakdown;
        return typeof tb === "object" && tb !== null
          ? (tb as ContractorStats["trustBreakdown"])
          : undefined;
      })(),
    };
  }

  /** Resident joins a building via an invite code. */
  async joinBuilding(inviteCode: string) {
    return this.request<{ status: string; building_id?: string }>(
      `/api/v1/buildings/join`,
      { method: "POST", body: { invite_code: inviteCode } },
    );
  }

  /** BM/admin creates a new building. Caller becomes the admin_user_id. */
  async createBuilding(payload: {
    name: string;
    address: string;
    city: string;
    region: string;
    total_units?: number;
    floors?: number;
    year_built?: number;
  }) {
    return this.request<import("@groupio/types").Building & { invite_code?: string }>(
      `/api/v1/buildings/`,
      { method: "POST", body: payload },
    );
  }

  /** Rotate the invite code for a building. BM/admin only. */
  async regenerateBuildingInviteCode(buildingId: string) {
    return this.request<{ building_id: string; invite_code: string }>(
      `/api/v1/buildings/${encodeURIComponent(buildingId)}/regenerate-invite`,
      { method: "POST" },
    );
  }

  /** Address enrichment (data.gov.il fallback to stub when disabled). */
  async normalizeAddress(address: string, city: string) {
    return this.request<{
      address: string;
      city: string;
      street: string | null;
      house_number: string | null;
      municipality: string | null;
      confidence: number;
      source: string;
    }>(`/api/v1/enrichment/normalize-address`, {
      method: "POST",
      body: { address, city },
    });
  }

  /** Submit the post-signup onboarding payload (resident or contractor). */
  async submitOnboarding(payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>(`/api/v1/onboarding`, {
      method: "POST",
      body: payload,
    });
  }

  /** Paginated list of reviews left on a contractor (read-only listing). */
  async getContractorReviews(contractorId: string, params?: { limit?: number; offset?: number }) {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set("limit", String(params.limit));
    if (params?.offset != null) search.set("offset", String(params.offset));
    const qs = search.toString();
    return this.request<{
      items: Array<{
        id: string;
        contractor_id: string;
        user_id?: string;
        offer_id?: string;
        rating: number;
        comment?: string;
        created_at: string;
      }>;
      total: number;
    }>(`/api/v1/contractors/${encodeURIComponent(contractorId)}/reviews${qs ? `?${qs}` : ""}`);
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
