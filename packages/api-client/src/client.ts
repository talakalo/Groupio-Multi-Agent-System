import type {
  MessageRequest,
  MessageResponse,
  Offer,
  Contractor,
  Building,
  AgentMetrics,
  Escalation,
  SystemStatus,
} from "@groupio/types";

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
    return this.get<EscalationsResponse>("/escalations");
  }

  async getSystemStatus(): Promise<SystemStatus> {
    return this.get<SystemStatus>("/admin/status");
  }

  async getAnalytics(): Promise<{
    gmvToday?: number;
    gmvChange?: number;
    activeOffers?: number;
    activeOffersChange?: number;
    openTickets?: number;
    openTicketsChange?: number;
    resolvedToday?: number;
  }> {
    return this.get("/admin/analytics");
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
}
