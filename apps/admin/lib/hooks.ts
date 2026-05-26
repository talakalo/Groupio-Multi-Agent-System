"use client";

import {
  GroupioApiClient,
  type MetricsResponse,
  type EscalationsResponse,
  type HealthStatus,
} from "@groupio/api-client";
import type {
  SystemStatus,
  Contractor,
} from "@groupio/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ---- Client Singleton ----

let apiClient: GroupioApiClient | undefined;

/** Admin uses HTTP-only cookies for auth. No token in JS (reduces XSS exposure). */
function getApiClient(): GroupioApiClient {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
  const baseUrlWithPrefix = baseUrl.endsWith("/api/v1") ? baseUrl : `${baseUrl}/api/v1`;
  if (!apiClient) {
    apiClient = new GroupioApiClient({ baseUrl: baseUrlWithPrefix });
  }
  return apiClient;
}

// ---- Query Keys ----

export const queryKeys = {
  metrics: ["admin", "metrics"] as const,
  escalations: ["admin", "escalations"] as const,
  systemStatus: ["admin", "system-status"] as const,
  health: ["admin", "health"] as const,
  agentMetrics: (agentName: string) =>
    ["admin", "agent-metrics", agentName] as const,
  contractors: ["admin", "contractors"] as const,
};

// ---- Dashboard Metrics ----

export interface DashboardMetrics {
  gmvToday: number;
  gmvChange: number;
  activeOffers: number;
  activeOffersChange: number;
  pendingVerifications: number;
  urgentVerifications: number;
  openTickets: number;
  openTicketsChange: number;
}

export function useMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: queryKeys.metrics,
    queryFn: async () => {
      const client = getApiClient();
      return client.getMetrics();
    },
    refetchInterval: 30_000,
  });
}

export function useDashboardMetrics() {
  return useQuery<DashboardMetrics>({
    queryKey: [...queryKeys.metrics, "dashboard"],
    queryFn: async (): Promise<DashboardMetrics> => {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/?$/, "") || "http://localhost:8000";
      const analyticsUrl = baseUrl.endsWith("/api/v1")
        ? `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/admin/analytics`
        : `${baseUrl}/api/v1/admin/analytics`;

      try {
        const res = await fetch(analyticsUrl, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          return {
            gmvToday: data.gmvToday ?? 0,
            gmvChange: data.gmvChange ?? 0,
            activeOffers: data.activeOffers ?? 0,
            activeOffersChange: data.activeOffersChange ?? 0,
            pendingVerifications: 0,
            urgentVerifications: 0,
            openTickets: data.openTickets ?? 0,
            openTicketsChange: data.openTicketsChange ?? 0,
          };
        }
      } catch {
        // Fall through to fallback
      }

      // Fallback: try system metrics
      const client = getApiClient();
      try {
        const metricsData = await client.getMetrics();
        return {
          gmvToday: 0,
          gmvChange: 0,
          activeOffers: 0,
          activeOffersChange: 0,
          pendingVerifications: 0,
          urgentVerifications: 0,
          openTickets: metricsData.totalErrors,
          openTicketsChange: 0,
        };
      } catch {
        return {
          gmvToday: 0,
          gmvChange: 0,
          activeOffers: 0,
          activeOffersChange: 0,
          pendingVerifications: 0,
          urgentVerifications: 0,
          openTickets: 0,
          openTicketsChange: 0,
        };
      }
    },
    refetchInterval: 30_000,
  });
}

// ---- Escalations ----

export function useEscalations(filters?: {
  priority?: string;
  status?: string;
}) {
  return useQuery<EscalationsResponse>({
    queryKey: [...queryKeys.escalations, filters],
    queryFn: async () => {
      const client = getApiClient();
      return await client.getEscalations();
    },
    refetchInterval: 30_000,
  });
}

export function useResolveEscalation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      escalationId,
      resolution_notes,
    }: {
      escalationId: string;
      resolution_notes?: string;
    }) => {
      const rawBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
      const base = rawBase.endsWith("/api/v1") ? rawBase : `${rawBase}/api/v1`;
      const response = await fetch(
        `${base}/escalations/${escalationId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: resolution_notes ? JSON.stringify({ resolution_notes }) : undefined,
        }
      );
      if (!response.ok) throw new Error("Failed to resolve escalation");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.escalations });
    },
  });
}

// ---- System Status ----

export function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: queryKeys.systemStatus,
    queryFn: async () => {
      const client = getApiClient();
      return await client.getSystemStatus();
    },
    refetchInterval: 60_000,
  });
}

export function useHealthStatus() {
  return useQuery<HealthStatus>({
    queryKey: queryKeys.health,
    queryFn: async () => {
      const client = getApiClient();
      return await client.getHealth();
    },
    refetchInterval: 30_000,
  });
}

// ---- Agent Metrics ----

export interface AgentDetailMetrics {
  name: string;
  model: string;
  totalCalls: number;
  errorRate: number;
  avgLatencyMs: number;
  successRate: number;
  callsToday: number;
  tokensUsed: number;
  history: { timestamp: string; calls: number; avgLatencyMs: number }[];
}

export function useAgentMetrics(agentName: string) {
  return useQuery<AgentDetailMetrics>({
    queryKey: queryKeys.agentMetrics(agentName),
    queryFn: async (): Promise<AgentDetailMetrics> => {
      // In production, this calls a per-agent metrics endpoint.
      // Build representative data from system status.
      const client = getApiClient();
      try {
        const status = await client.getSystemStatus();
        const agent = status.agents[agentName];
        if (!agent) throw new Error(`Agent ${agentName} not found`);

        const errorRate =
          agent.calls > 0
            ? Number(((agent.errors / agent.calls) * 100).toFixed(2))
            : 0;

        return {
          name: agentName,
          model: agent.model,
          totalCalls: agent.calls,
          errorRate,
          avgLatencyMs: agent.avgDurationMs ?? 0,
          successRate: 100 - errorRate,
          callsToday: 0,   // requires a time-series endpoint (not yet available)
          tokensUsed: agent.tokens ?? 0,
          history: [],     // requires a time-series endpoint (not yet available)
        };
      } catch {
        return {
          name: agentName,
          model: "unknown",
          totalCalls: 0,
          errorRate: 0,
          avgLatencyMs: 0,
          successRate: 0,
          callsToday: 0,
          tokensUsed: 0,
          history: [],
        };
      }
    },
    refetchInterval: 60_000,
  });
}

// generateHistory was removed — it produced synthetic chart data using Math.sin
// and Math.random that showed fabricated trends. Historical time-series data
// should be fetched from a real /admin/agents/:name/history endpoint.

// ---- Agent Reload ----

export function useReloadAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentName: string) => {
      const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
      const url = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
      const response = await fetch(
        `${url}/admin/agents/${encodeURIComponent(agentName)}/reload`,
        { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" }
      );
      if (!response.ok) throw new Error(`Failed to reload agent ${agentName}`);
      return response.json();
    },
    onSuccess: (_data, agentName) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.agentMetrics(agentName),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus });
    },
  });
}

// ---- Contractors ----

/** API returns snake_case; we normalize for UI. */
interface ContractorApiShape extends Contractor {
  trust_score?: number;
  average_rating?: number;
  business_name?: string;
  verification_status?: string;
  trust_score_breakdown?: {
    license_score?: number;
    insurance_score?: number;
    experience_score?: number;
    reputation_score?: number;
    completion_score?: number;
    response_score?: number;
    total?: number;
  };
}

export interface ContractorListItem {
  id: string;
  businessName: string;
  verified: boolean;
  /** Raw verification_status from API (pending | verified | approved | rejected | suspended). */
  verificationStatus: string;
  rating: number;
  categories: string[];
  regions: string[];
  phone?: string;
  email?: string;
  /** 0–100 from API; null when not yet calculated. */
  trustScore: number | null;
  trustScoreBreakdown?: ContractorApiShape["trust_score_breakdown"];
}

function mapContractorToListItem(c: ContractorApiShape): ContractorListItem {
  const raw = c.trustScore ?? c.trust_score;
  const trustScore =
    typeof raw === "number" && !Number.isNaN(raw) ? raw : null;
  const rating = c.rating ?? c.average_rating ?? 0;
  const verified =
    c.verified ??
    (c.verification_status === "verified" || c.verification_status === "approved");
  return {
    id: c.id,
    businessName: c.businessName ?? c.business_name ?? "",
    verified: Boolean(verified),
    verificationStatus: c.verification_status ?? (verified ? "verified" : "pending"),
    rating,
    categories: Array.isArray(c.categories) ? c.categories : [],
    regions: Array.isArray(c.regions) ? c.regions : [],
    phone: c.phone,
    email: c.email,
    trustScore,
    trustScoreBreakdown: c.trust_score_breakdown,
  };
}

export function useContractors(filters?: {
  verified?: boolean;
  category?: string;
  region?: string;
}) {
  return useQuery<ContractorListItem[]>({
    queryKey: [...queryKeys.contractors, filters],
    queryFn: async (): Promise<ContractorListItem[]> => {
      const client = getApiClient();
      const params: { verification_status?: string; category?: string; region?: string } = {};
      if (filters?.verified !== undefined) {
        params.verification_status = filters.verified ? "verified" : "pending";
      }
      if (filters?.category) params.category = filters.category;
      if (filters?.region) params.region = filters.region;
      const res = await client.getContractors(params);
      return res.items.map(mapContractorToListItem);
    },
  });
}

// ---- Analytics ----

export interface AdminAnalyticsDashboard {
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
  agentPerformance?: { name: string; [key: string]: unknown }[];
}

export function useAdminAnalyticsDashboard() {
  return useQuery<AdminAnalyticsDashboard>({
    queryKey: ["admin", "analytics-dashboard"],
    queryFn: async () => {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
      const backendUrl = baseUrl.endsWith("/api/v1") ? `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/admin/analytics` : `${baseUrl}/api/v1/admin/analytics`;

      // Try the backend first, fall back to the Next.js proxy route
      const res = await fetch(backendUrl, { credentials: "include" }).catch(() => null);
      if (res?.ok) return res.json() as Promise<AdminAnalyticsDashboard>;

      const proxyRes = await fetch("/api/admin/analytics", { credentials: "include" });
      if (!proxyRes.ok) throw new Error("Failed to fetch analytics");
      return proxyRes.json();
    },
    refetchInterval: 60_000,
  });
}

export function useAnalyticsQuery() {
  return useMutation({
    mutationFn: async (query: string) => {
      const client = getApiClient();
      const response = await client.sendMessage({
        user_id: "admin",
        message: query,
        channel: "admin",
      });
      return response;
    },
  });
}

// ---- Activity Log (from audit logs) ----

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: "agent" | "escalation" | "contractor" | "system";
  message: string;
}

export function useActivityLog() {
  return useQuery<ActivityLogEntry[]>({
    queryKey: ["admin", "activity-log"],
    queryFn: async (): Promise<ActivityLogEntry[]> => {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
      const url = baseUrl.endsWith("/api/v1")
        ? `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/admin/audit-logs?page_size=10`
        : `${baseUrl}/api/v1/admin/audit-logs?page_size=10`;

      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];

      const data = await res.json();
      const items: Array<Record<string, unknown>> = data.items ?? [];

      const typeMap: Record<string, ActivityLogEntry["type"]> = {
        create_user: "system",
        update_user: "system",
        flag_offer: "escalation",
        approve_offer: "contractor",
        cancel_offer: "system",
        update_settings: "system",
        create_escalation: "escalation",
        resolve_escalation: "escalation",
      };

      return items.map((item, idx) => {
        const action = String(item.action ?? "system");
        return {
          id: String(item.id ?? idx),
          timestamp: String(item.created_at ?? new Date().toISOString()),
          type: typeMap[action] ?? "system",
          message: `${action.replace(/_/g, " ")} on ${item.resource_type ?? "resource"} ${String(item.resource_id ?? "").slice(0, 8)}`,
        };
      });
    },
    refetchInterval: 30_000,
  });
}

// ---- Pending Agent Decisions ----

export interface PendingDecisionItem {
  id: string;
  agent_name: string;
  conversation_id: string | null;
  user_id: string | null;
  action_type: string;
  payload: Record<string, unknown>;
  escalation_reason: string | null;
  status: string;
  created_at: string;
}

export const pendingDecisionsKey = ["admin", "pending-decisions"] as const;

function getAdminBase(): string {
  const rawBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
  return rawBase.endsWith("/api/v1") ? rawBase : `${rawBase}/api/v1`;
}

export function usePendingDecisions(status = "pending") {
  return useQuery<{ items: PendingDecisionItem[]; total: number }>({
    queryKey: [...pendingDecisionsKey, status],
    queryFn: async () => {
      const base = getAdminBase();
      const res = await fetch(
        `${base}/admin/agents/pending-decisions?status=${encodeURIComponent(status)}&page_size=20`,
        { credentials: "include" },
      );
      if (!res.ok) return { items: [], total: 0 };
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

export function useApprovePendingDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ decisionId, note = "" }: { decisionId: string; note?: string }) => {
      const base = getAdminBase();
      const res = await fetch(
        `${base}/admin/agents/pending-decisions/${encodeURIComponent(decisionId)}/approve?note=${encodeURIComponent(note)}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to approve decision");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pendingDecisionsKey });
    },
  });
}

export function useRejectPendingDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ decisionId, note = "" }: { decisionId: string; note?: string }) => {
      const base = getAdminBase();
      const res = await fetch(
        `${base}/admin/agents/pending-decisions/${encodeURIComponent(decisionId)}/reject?note=${encodeURIComponent(note)}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to reject decision");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pendingDecisionsKey });
    },
  });
}

// ---- Agent Autonomy Modes ----

export type AgentAutonomyMap = Record<string, string>;

export const agentAutonomyKey = ["admin", "agent-autonomy"] as const;

export function useAgentAutonomy() {
  return useQuery<AgentAutonomyMap>({
    queryKey: agentAutonomyKey,
    queryFn: async () => {
      const base = getAdminBase();
      const res = await fetch(`${base}/admin/agents/autonomy`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useUpdateAgentMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modes: Record<string, string>) => {
      // Map agent keys to env-var-style setting keys expected by PUT /admin/settings
      const settingsPayload: Record<string, string> = {};
      const keyMap: Record<string, string> = {
        matching: "MATCHING_AGENT_MODE",
        pricing: "PRICING_AGENT_MODE",
        vetting: "VETTING_AGENT_MODE",
        outreach: "OUTREACH_AGENT_MODE",
        payment: "PAYMENT_AGENT_MODE",
      };
      for (const [agentKey, mode] of Object.entries(modes)) {
        const settingKey = keyMap[agentKey];
        if (settingKey) settingsPayload[settingKey] = mode;
      }
      if (Object.keys(settingsPayload).length === 0) return {};
      const base = getAdminBase();
      const res = await fetch(`${base}/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settingsPayload),
      });
      if (!res.ok) throw new Error("Failed to persist agent mode");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentAutonomyKey });
    },
  });
}

// ---- Admin user (for header) ----

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export function useAdminUser() {
  return useQuery<AdminUser | null>({
    queryKey: ["admin", "me"],
    queryFn: async (): Promise<AdminUser | null> => {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
      const url = baseUrl.endsWith("/api/v1") ? `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/auth/me` : `${baseUrl}/api/v1/auth/me`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
}

// ---- Vetting Pipeline Status ----

export interface VettingStatus {
  pendingReview: number;
  approved: number;
  rejected: number;
  pendingContractors: Array<{
    id: string;
    businessName: string;
    submittedAt: string;
    trustScore?: number;
  }>;
}

export function useVettingStatus() {
  return useQuery<VettingStatus>({
    queryKey: ["admin", "vetting-status"],
    queryFn: async (): Promise<VettingStatus> => {
      const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
      const url = baseUrl.endsWith("/api/v1")
        ? `${baseUrl.replace(/\/api\/v1$/, "")}/api/v1/admin/vetting/status`
        : `${baseUrl}/api/v1/admin/vetting/status`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { pendingReview: 0, approved: 0, rejected: 0, pendingContractors: [] };
      return res.json();
    },
    refetchInterval: 60_000,
  });
}
