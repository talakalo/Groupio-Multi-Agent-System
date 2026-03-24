/**
 * Shared API client for Groupio backend.
 * Used by admin app; web app uses its own apps/web/lib/api/client.ts (token refresh, different base).
 * Types from @groupio/types. Consider unifying if API surface stabilizes.
 */

import type {
  MessageRequest,
  MessageResponse,
  Offer,
  Contractor,
  Building,
  AgentMetrics,
  Escalation,
  SystemStatus,
  Payment,
  Invoice,
  EscrowAccount,
  ContractorPayout,
  PaymentSummary,
} from "@groupio/types";

/** Map FastAPI/Pydantic escalation rows (snake_case + enum values) to @groupio/types Escalation. */
function normalizeEscalationFromApi(raw: Record<string, unknown>): Escalation {
  const statusRaw = String(raw.status ?? "open").toLowerCase();
  const statusMap: Record<string, Escalation["status"]> = {
    open: "open",
    in_progress: "assigned",
    waiting_customer: "assigned",
    assigned: "assigned",
    resolved: "resolved",
    closed: "resolved",
  };
  const status = statusMap[statusRaw] ?? "open";

  const pr = String(raw.priority ?? "medium").toLowerCase();
  let priority: Escalation["priority"] = "normal";
  if (pr === "low") priority = "low";
  else if (pr === "medium") priority = "normal";
  else if (pr === "high") priority = "high";
  else if (pr === "critical" || pr === "urgent") priority = "urgent";

  let ctx: Record<string, unknown> = {};
  const c = raw.context;
  if (typeof c === "string") {
    try {
      const p = JSON.parse(c) as unknown;
      if (p && typeof p === "object") ctx = p as Record<string, unknown>;
    } catch {
      ctx = {};
    }
  } else if (c && typeof c === "object") {
    ctx = c as Record<string, unknown>;
  }

  const intent = typeof ctx.intent === "string" ? ctx.intent : "";
  const actionsRaw = ctx.actionsTaken;
  const actionsTaken: { agent: string; action: string }[] = [];
  if (Array.isArray(actionsRaw)) {
    for (const a of actionsRaw) {
      if (!a || typeof a !== "object") continue;
      const o = a as { agent?: unknown; action?: unknown };
      if (typeof o.agent === "string") {
        actionsTaken.push({
          agent: o.agent,
          action: typeof o.action === "string" ? o.action : "",
        });
      }
    }
  }
  const ragSummary = typeof ctx.ragSummary === "string" ? ctx.ragSummary : undefined;

  const createdRaw = raw.created_at ?? raw.createdAt;
  const createdAt =
    typeof createdRaw === "string"
      ? createdRaw
      : createdRaw instanceof Date
        ? createdRaw.toISOString()
        : new Date(0).toISOString();

  return {
    id: String(raw.id ?? ""),
    userId: String(raw.user_id ?? raw.userId ?? ""),
    conversationId: String(raw.conversation_id ?? raw.conversationId ?? ""),
    reason: String(raw.reason ?? ""),
    priority,
    status,
    context: { intent, actionsTaken, ragSummary },
    createdAt,
    /** From API `source_agent` when `context.actionsTaken` is empty (e.g. seed rows). */
    sourceAgent: typeof raw.source_agent === "string" ? raw.source_agent : undefined,
  } as Escalation;
}

// ---- Error Types ----

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export class ValidationError extends ApiError {
  constructor(detail: string) {
    super("Validation error", 400, detail);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(detail?: string) {
    super("Unauthorized", 401, detail ?? "Missing or invalid authentication");
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super("Not found", 404, `Resource not found: ${resource}`);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends ApiError {
  constructor() {
    super("Rate limited", 429, "Too many requests. Please try again later.");
    this.name = "RateLimitError";
  }
}

// ---- Health Status ----

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  services: {
    vector_db: boolean;
    graph_db: boolean;
    redis: boolean;
    postgres: boolean;
  };
}

// ---- Metrics Response ----

export interface MetricsResponse {
  agents: AgentMetrics[];
  totalCalls: number;
  totalErrors: number;
  totalTokens: number;
}

// ---- Escalations Response ----

export interface EscalationsResponse {
  escalations: Escalation[];
  total: number;
}

// ---- Contractors List Response ----

export interface ContractorsListResponse {
  items: Contractor[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

// ---- Pending Agent Decisions ----

export interface PendingDecision {
  id: string;
  agent_name: string;
  conversation_id?: string;
  user_id?: string;
  action_type: string;
  payload: Record<string, unknown>;
  escalation_reason?: string;
  status: "pending" | "approved" | "rejected";
  decided_by?: string;
  decision_note?: string;
  decided_at?: string;
  created_at: string;
}

export interface PendingDecisionsResponse {
  items: PendingDecision[];
  total: number;
  page: number;
  page_size: number;
}

// ---- Credit Awards ----

export interface CreditAward {
  id: string;
  resident_id: string;
  amount: number;
  reason: string;
  status: "pending_approval" | "approved" | "rejected" | "applied";
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

// ---- Client Configuration ----

export interface ApiClientConfig {
  baseUrl?: string;
  authToken?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

// ---- API Client ----

export class GroupioApiClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeout: number;
  private readonly customHeaders: Record<string, string>;
  private refreshAccessPromise: Promise<boolean> | null = null;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "/api/v1").replace(/\/+$/, "");
    this.authToken = config.authToken;
    this.timeout = config.timeout ?? 30_000;
    this.customHeaders = config.headers ?? {};
  }

  // ---- Core Methods ----

  async sendMessage(request: MessageRequest): Promise<MessageResponse> {
    return this.post<MessageResponse>("/message", request);
  }

  async getHealth(): Promise<HealthStatus> {
    return this.get<HealthStatus>("/health");
  }

  // ---- Offer Methods ----

  async getOffers(buildingId: string): Promise<Offer[]> {
    return this.get<Offer[]>(`/offers?buildingId=${encodeURIComponent(buildingId)}`);
  }

  async joinOffer(offerId: string, userId: string): Promise<void> {
    await this.post<void>(`/offers/${encodeURIComponent(offerId)}/join`, { userId });
  }

  // ---- Contractor Methods ----

  async getContractors(params?: {
    category?: string;
    region?: string;
    min_trust_score?: number;
    verification_status?: string;
    page?: number;
    page_size?: number;
  }): Promise<ContractorsListResponse> {
    const search = new URLSearchParams();
    if (params?.category) search.set("category", params.category);
    if (params?.region) search.set("region", params.region);
    if (params?.min_trust_score != null) search.set("min_trust_score", String(params.min_trust_score));
    if (params?.verification_status) search.set("verification_status", params.verification_status);
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.get<ContractorsListResponse>(`/contractors${qs ? `?${qs}` : ""}`);
  }

  /** Admin: all contractors (not restricted to marketplace-visible membership). */
  async getAdminContractors(params?: {
    category?: string;
    region?: string;
    min_trust_score?: number;
    verification_status?: string;
    page?: number;
    page_size?: number;
  }): Promise<ContractorsListResponse> {
    const search = new URLSearchParams();
    if (params?.category) search.set("category", params.category);
    if (params?.region) search.set("region", params.region);
    if (params?.min_trust_score != null) search.set("min_trust_score", String(params.min_trust_score));
    if (params?.verification_status) search.set("verification_status", params.verification_status);
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.get<ContractorsListResponse>(`/admin/contractors${qs ? `?${qs}` : ""}`);
  }

  async getContractor(id: string): Promise<Contractor> {
    return this.get<Contractor>(`/contractors/${encodeURIComponent(id)}`);
  }

  // ---- Building Methods ----

  async getBuilding(id: string): Promise<Building> {
    return this.get<Building>(`/buildings/${encodeURIComponent(id)}`);
  }

  // ---- Admin Methods ----

  async getMetrics(): Promise<MetricsResponse> {
    return this.get<MetricsResponse>("/admin/metrics");
  }

  async getEscalations(): Promise<EscalationsResponse> {
    const raw = await this.get<{
      items?: Record<string, unknown>[];
      escalations?: Record<string, unknown>[];
      total: number;
    }>("/escalations");
    const rawList = raw.escalations ?? raw.items ?? [];
    const list = Array.isArray(rawList)
      ? rawList.map((row) => normalizeEscalationFromApi(row))
      : [];
    return { escalations: list, total: raw.total };
  }

  /** Admin: partial update (priority, status, assignee, notes). Uses cookie/session pipeline. */
  async updateEscalation(
    escalationId: string,
    body: {
      status?: string;
      priority?: string;
      assigned_to?: string;
      resolution_notes?: string | null;
    },
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "PUT",
      `/escalations/${encodeURIComponent(escalationId)}`,
      body,
    );
  }

  async assignEscalation(escalationId: string, assignedTo: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "POST",
      `/escalations/${encodeURIComponent(escalationId)}/assign`,
      { assigned_to: assignedTo },
    );
  }

  async resolveEscalation(
    escalationId: string,
    resolutionNotes?: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "POST",
      `/escalations/${encodeURIComponent(escalationId)}/resolve`,
      resolutionNotes ? { resolution_notes: resolutionNotes } : {},
    );
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const raw = await this.get<{
      agents?: Record<string, Record<string, unknown>>;
      vector_collections?: Record<string, { pointsCount?: number; status?: string }>;
      vectorCollections?: Record<string, { pointsCount?: number; status?: string }>;
    }>("/admin/status");
    const agentsIn = raw.agents ?? {};
    const agents: SystemStatus["agents"] = {};
    for (const [key, m] of Object.entries(agentsIn)) {
      agents[key] = {
        model: String(m.model ?? ""),
        calls: Number(m.calls ?? 0),
        errors: Number(m.errors ?? 0),
        avgDurationMs: Number(m.avg_duration_ms ?? m.avgDurationMs ?? 0),
        tokens: Number(m.tokens ?? 0),
      };
    }
    const vec = raw.vector_collections ?? raw.vectorCollections ?? {};
    const vectorCollections: SystemStatus["vectorCollections"] = {};
    for (const [k, v] of Object.entries(vec)) {
      vectorCollections[k] = {
        pointsCount: Number((v as { pointsCount?: number }).pointsCount ?? 0),
        status: String((v as { status?: string }).status ?? "unknown"),
      };
    }
    return { agents, vectorCollections };
  }

  async getAnalytics(): Promise<{
    gmvToday?: number;
    gmvChange?: number;
    activeOffers?: number;
    activeOffersChange?: number;
    openTickets?: number;
    openTicketsChange?: number;
    resolvedToday?: number;
    totalContractors?: number;
    categoryBreakdown?: Record<string, number>;
    regionalData?: Record<string, number>;
    dailyOffers?: { date: string; count: number }[];
    dailyRevenue?: { date: string; amount: number }[];
    agentPerformance?: { agent: string; accuracy: number; responseTime: number; throughput: number }[];
  }> {
    return this.get("/admin/analytics");
  }

  // ---- Payment Methods ----

  async getMyPayments(): Promise<Payment[]> {
    return this.get<Payment[]>("/payments/my");
  }

  async initiatePayment(offerId: string, paymentMethodId?: string): Promise<Payment> {
    return this.post<Payment>("/payments/initiate", {
      offer_id: offerId,
      payment_method_id: paymentMethodId,
    });
  }

  async getPayment(paymentId: string): Promise<Payment> {
    return this.get<Payment>(`/payments/${encodeURIComponent(paymentId)}`);
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    return this.get<Invoice>(`/payments/invoices/${encodeURIComponent(invoiceId)}`);
  }

  // ---- Admin Payment Methods ----

  async getPaymentSummary(): Promise<PaymentSummary> {
    return this.get<PaymentSummary>("/admin/payments/summary");
  }

  async getEscrowAccounts(): Promise<EscrowAccount[]> {
    return this.get<EscrowAccount[]>("/admin/payments/escrow");
  }

  async getContractorPayouts(): Promise<ContractorPayout[]> {
    return this.get<ContractorPayout[]>("/admin/payments/payouts");
  }

  async approveContractorPayout(payoutId: string): Promise<ContractorPayout> {
    return this.post<ContractorPayout>(
      `/admin/payments/payouts/${encodeURIComponent(payoutId)}/approve`
    );
  }

  async releaseEscrow(offerId: string): Promise<{ status: string }> {
    return this.post<{ status: string }>(
      `/admin/payments/escrow/${encodeURIComponent(offerId)}/release`
    );
  }

  // ---- Refund Methods ----

  async requestRefund(
    paymentId: string,
    reason?: string,
    amount?: number,
  ): Promise<{ payment_id: string; refund_id: string; status: string; amount: number; reason: string }> {
    return this.post(`/payments/${encodeURIComponent(paymentId)}/refund`, { reason, amount });
  }

  // ---- Push Token ----

  async registerPushToken(token: string): Promise<{ status: string }> {
    return this.post<{ status: string }>("/auth/push-token", { token });
  }

  async unregisterPushToken(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/auth/push-token`, {
      method: "DELETE",
      headers: this.buildHeaders(),
      credentials: "include",
    });
    if (!response.ok) await this.handleErrorResponse(response, "/auth/push-token");
    return response.json() as Promise<{ status: string }>;
  }

  // ---- Pending Agent Decisions (Admin) ----

  async listPendingDecisions(params?: {
    status?: string;
    agent_name?: string;
    page?: number;
    page_size?: number;
  }): Promise<PendingDecisionsResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.agent_name) search.set("agent_name", params.agent_name);
    if (params?.page != null) search.set("page", String(params.page));
    if (params?.page_size != null) search.set("page_size", String(params.page_size));
    const qs = search.toString();
    return this.get<PendingDecisionsResponse>(`/admin/agents/pending-decisions${qs ? `?${qs}` : ""}`);
  }

  async approvePendingDecision(decisionId: string, note?: string): Promise<PendingDecision> {
    return this.post<PendingDecision>(
      `/admin/agents/pending-decisions/${encodeURIComponent(decisionId)}/approve`,
      undefined,
      note ? `?note=${encodeURIComponent(note)}` : "",
    );
  }

  async rejectPendingDecision(decisionId: string, note?: string): Promise<PendingDecision> {
    return this.post<PendingDecision>(
      `/admin/agents/pending-decisions/${encodeURIComponent(decisionId)}/reject`,
      undefined,
      note ? `?note=${encodeURIComponent(note)}` : "",
    );
  }

  // ---- Credit Awards (Admin) ----

  async listCreditAwards(params?: {
    resident_id?: string;
    status?: string;
  }): Promise<CreditAward[]> {
    const search = new URLSearchParams();
    if (params?.resident_id) search.set("resident_id", params.resident_id);
    if (params?.status) search.set("status", params.status);
    const qs = search.toString();
    return this.get<CreditAward[]>(`/admin/credit-awards${qs ? `?${qs}` : ""}`);
  }

  // ---- Internal HTTP Helpers ----

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.customHeaders,
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /** Cookie-based sessions: renew access_token using refresh_token cookie. */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshAccessPromise) {
      this.refreshAccessPromise = (async () => {
        try {
          const url = `${this.baseUrl}/auth/refresh`;
          const r = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...this.buildHeaders(),
            },
            credentials: "include",
            body: "{}",
          });
          return r.ok;
        } catch {
          return false;
        } finally {
          this.refreshAccessPromise = null;
        }
      })();
    }
    return this.refreshAccessPromise;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetryAfterRefresh = false,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        credentials: "include", // Send HTTP-only cookies (e.g. access_token)
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError(`Request to ${path} timed out after ${this.timeout}ms`);
      }
      throw new NetworkError(
        `Network request to ${path} failed`,
        error,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (
      response.status === 401 &&
      !isRetryAfterRefresh &&
      path !== "/auth/refresh" &&
      path !== "/auth/login/json"
    ) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(method, path, body, true);
      }
    }

    if (!response.ok) {
      await this.handleErrorResponse(response, path);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        "Invalid JSON response",
        response.status,
        `Could not parse response from ${path}`,
      );
    }
  }

  private async handleErrorResponse(response: Response, path: string): Promise<never> {
    let detail: string | undefined;
    try {
      const body = await response.json();
      detail = (body as { detail?: string }).detail ?? JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }

    switch (response.status) {
      case 400:
        throw new ValidationError(detail ?? "Invalid request");
      case 401:
        throw new UnauthorizedError(detail);
      case 404:
        throw new NotFoundError(path);
      case 429:
        throw new RateLimitError();
      default:
        throw new ApiError(
          `Request failed with status ${response.status}`,
          response.status,
          detail,
        );
    }
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body?: unknown, qs?: string): Promise<T> {
    return this.request<T>("POST", qs ? `${path}${qs}` : path, body);
  }
}
