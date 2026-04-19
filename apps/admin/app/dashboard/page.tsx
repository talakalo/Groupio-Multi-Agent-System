"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Database,
  DollarSign,
  Eye,
  FileText,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { AgentMetricsChart, type AgentChartSeries } from "@/components/features/metrics/AgentMetricsChart";
import { MetricCard } from "@/components/features/metrics/MetricCard";
import {
  getApiClient,
  useActivityLog,
  useAdminAnalyticsDashboard,
  useContractors,
  useDashboardMetrics,
  useEscalations,
  useHealthStatus,
  useSystemStatus,
  useVettingStatus,
} from "@/lib/hooks";

const AGENTS = [
  { key: "router", name: "Router" },
  { key: "matching", name: "Matching" },
  { key: "pricing", name: "Pricing" },
  { key: "vetting", name: "Vetting" },
  { key: "support", name: "Support" },
  { key: "outreach", name: "Outreach" },
  { key: "analytics", name: "Analytics" },
] as const;

type ActivityLogEntry = {
  id: string;
  timestamp: string;
  type: "agent" | "escalation" | "contractor" | "system";
  message: string;
};

type AdminPaymentSummary = {
  totalCollected?: number;
  totalInEscrow?: number;
  totalReleasedToContractors?: number;
  totalPlatformFees?: number;
  totalRefunded?: number;
  pendingPayouts?: number;
  total_collected?: number;
  total_in_escrow?: number;
  total_released_to_contractors?: number;
  total_platform_fees?: number;
  total_refunded?: number;
  pending_payouts?: number;
  currency?: string;
};

function paymentNumber(summary: AdminPaymentSummary | undefined, camel: keyof AdminPaymentSummary, snake: keyof AdminPaymentSummary): number {
  const value = summary?.[camel] ?? summary?.[snake] ?? 0;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function useAdminPaymentSummary() {
  return useQuery<AdminPaymentSummary>({
    queryKey: ["admin", "payments", "summary"],
    queryFn: async () => {
      const client = getApiClient();
      return client.getPaymentSummary() as unknown as AdminPaymentSummary;
    },
    refetchInterval: 30_000,
  });
}

const ACTIVITY_TYPE_ICON: Record<
  ActivityLogEntry["type"],
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  agent: { icon: Zap, color: "text-primary-500 bg-primary-50" },
  escalation: { icon: AlertTriangle, color: "text-warning-500 bg-warning-50" },
  contractor: { icon: Users, color: "text-success-500 bg-success-50" },
  system: { icon: Server, color: "text-surface-500 bg-surface-100" },
};

export default function DashboardPage() {
  const {
    data: metrics,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useDashboardMetrics();
  const {
    data: systemStatus,
    isLoading: systemLoading,
    isError: systemError,
    refetch: refetchSystemStatus,
  } = useSystemStatus();
  const {
    data: escalationsData,
    isLoading: escalationsLoading,
    isError: escalationsError,
    refetch: refetchEscalations,
  } = useEscalations();
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthFetchError,
    refetch: refetchHealth,
  } = useHealthStatus();
  const { data: analyticsData, isLoading: analyticsLoading, isError: analyticsError } = useAdminAnalyticsDashboard();
  const { data: activityLog = [], isLoading: activityLoading, isError: activityError } = useActivityLog();
  const { data: vettingStatus, isLoading: vettingLoading, isError: vettingError } = useVettingStatus();
  const {
    data: unverifiedContractors = [],
    isLoading: contractorsLoading,
    isError: contractorsError,
  } = useContractors({ verified: false });
  const {
    data: paymentSummary,
    isLoading: paymentSummaryLoading,
    isError: paymentSummaryError,
    refetch: refetchPaymentSummary,
  } = useAdminPaymentSummary();

  const pendingVetting = vettingStatus?.pendingReview ?? 0;
  const pendingPayments = paymentNumber(paymentSummary, "pendingPayouts", "pending_payouts");
  const totalInEscrow = paymentNumber(paymentSummary, "totalInEscrow", "total_in_escrow");

  const isInitialLoading = metricsLoading || systemLoading || healthLoading;
  const hasCriticalError = metricsError || systemError || healthFetchError;
  const hasPartialError =
    hasCriticalError ||
    escalationsError ||
    analyticsError ||
    activityError ||
    vettingError ||
    contractorsError ||
    paymentSummaryError;

  const handleRetry = () => {
    void refetchMetrics();
    void refetchSystemStatus();
    void refetchEscalations();
    void refetchHealth();
    void refetchPaymentSummary();
  };

  const agentSummary = useMemo(() => {
    if (!systemStatus?.agents) return [];
    return AGENTS.map((agent) => {
      const data = systemStatus.agents[agent.key];
      if (!data) return { ...agent, calls: 0, errors: 0, status: "offline" as const };
      const errorRate = data.calls > 0 ? (data.errors / data.calls) * 100 : 0;
      const status: "active" | "degraded" | "offline" = errorRate > 5 ? "degraded" : "active";
      return { ...agent, calls: data.calls, errors: data.errors, status };
    });
  }, [systemStatus]);

  const chartSeries: AgentChartSeries[] = useMemo(() => {
    const colors = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
    const now = new Date().toISOString();
    return AGENTS.map((agent, idx) => {
      const sysAgent = systemStatus?.agents?.[agent.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const errorRate = calls > 0 ? +((errors / calls) * 100).toFixed(2) : 0;
      return {
        agentKey: agent.key,
        label: agent.name,
        color: colors[idx % colors.length],
        data: [{ timestamp: now, calls, avgLatencyMs: 0, errorRate }],
      };
    });
  }, [systemStatus]);

  const recentEscalations = useMemo(() => {
    if (!escalationsData?.escalations) return [];
    return [...escalationsData.escalations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [escalationsData]);

  const openEscalations = recentEscalations.filter((e) => e.status === "open").length;

  const attentionItems = useMemo(() => {
    const items: Array<{ label: string; count: number; severity: "warning" | "danger"; href: string }> = [];
    if (pendingVetting > 0) {
      items.push({
        label: "Pending verifications",
        count: pendingVetting,
        severity: pendingVetting > 5 ? "danger" : "warning",
        href: "/contractors?status=pending",
      });
    }
    if (openEscalations > 0) {
      items.push({
        label: "Open escalations",
        count: openEscalations,
        severity: openEscalations > 3 ? "danger" : "warning",
        href: "/escalations?status=open",
      });
    }
    if (pendingPayments > 0) {
      items.push({
        label: "Pending payments",
        count: pendingPayments,
        severity: "warning",
        href: "/payments?status=pending",
      });
    }
    return items;
  }, [pendingVetting, openEscalations, pendingPayments]);

  const pendingActions = useMemo(() => {
    const actions: Array<{
      id: string;
      type: "contractor" | "escalation" | "payment";
      title: string;
      subtitle: string;
      href: string;
      actionLabel: string;
    }> = [];

    if (pendingPayments > 0) {
      actions.push({
        id: "pending-payments",
        type: "payment",
        title: `${pendingPayments} pending payment payout${pendingPayments > 1 ? "s" : ""}`,
        subtitle: `₪${totalInEscrow.toLocaleString()} currently in escrow`,
        href: "/payments?status=pending",
        actionLabel: "Review",
      });
    }

    for (const contractor of unverifiedContractors.slice(0, 3)) {
      actions.push({
        id: `contractor-${contractor.id}`,
        type: "contractor",
        title: contractor.businessName || "Unnamed contractor",
        subtitle: `Trust score: ${contractor.trustScore ?? "N/A"}`,
        href: `/contractors/${contractor.id}`,
        actionLabel: "Review",
      });
    }

    for (const escalation of recentEscalations.filter((e) => e.status === "open").slice(0, 2)) {
      actions.push({
        id: `escalation-${escalation.id}`,
        type: "escalation",
        title: escalation.reason,
        subtitle: `Priority: ${escalation.priority}`,
        href: `/escalations/${escalation.id}`,
        actionLabel: "Handle",
      });
    }

    return actions.slice(0, 5);
  }, [pendingPayments, totalInEscrow, unverifiedContractors, recentEscalations]);

  const healthServices = (health?.services ?? {}) as Record<string, boolean | undefined>;
  const allServicesUp = health ? Object.values(healthServices).every(Boolean) : false;
  const uptimeLabel = health ? (allServicesUp ? "100%" : "Degraded") : "Loading";

  const actionTypeIcon: Record<
    "contractor" | "escalation" | "payment",
    { icon: React.ComponentType<{ className?: string }>; color: string }
  > = {
    contractor: { icon: ShieldCheck, color: "bg-primary-50 text-primary-600" },
    escalation: { icon: AlertTriangle, color: "bg-warning-50 text-warning-600" },
    payment: { icon: CreditCard, color: "bg-success-50 text-success-600" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-sm text-surface-500 mt-0.5">System overview and real-time monitoring</p>
        </div>
        <button type="button" onClick={handleRetry} className="btn-secondary btn-sm" aria-label="Refresh dashboard data">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {isInitialLoading && (
        <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800" role="status">
          Loading live dashboard data…
        </div>
      )}

      {hasPartialError && (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap",
            hasCriticalError
              ? "border-danger-200 bg-danger-50 text-danger-800"
              : "border-warning-200 bg-warning-50 text-warning-800",
          )}
          role="alert"
        >
          <span>
            {hasCriticalError
              ? "Some critical dashboard data failed to load. Check backend/API health and retry."
              : "Some secondary dashboard widgets failed to load. Core metrics are still available."}
          </span>
          <button type="button" onClick={handleRetry} className="font-semibold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {attentionItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                item.severity === "danger"
                  ? "bg-danger-50 text-danger-700 border border-danger-200 hover:bg-danger-100"
                  : "bg-warning-50 text-warning-700 border border-warning-200 hover:bg-warning-100",
              )}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-bold">{item.count}</span> {item.label}
              </span>
              <ChevronRight className="w-3.5 h-3.5 ms-1 opacity-50" />
            </Link>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "status-dot",
                  healthLoading ? "bg-surface-300" : allServicesUp ? "status-dot-healthy" : "status-dot-degraded",
                )}
              />
              <span className="text-sm font-semibold text-surface-800">
                System {healthLoading ? "Loading" : allServicesUp ? "Healthy" : "Degraded"}
              </span>
            </div>
            <div className="h-5 w-px bg-surface-200" />
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Activity className="w-3.5 h-3.5" />
              <span>
                Uptime: <span className="font-semibold text-surface-700">{uptimeLabel}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {Object.entries(healthServices).map(([service, isUp]) => (
              <div key={service} className="flex items-center gap-1.5 text-xs">
                <span className={clsx("status-dot", isUp ? "status-dot-healthy" : "status-dot-unhealthy")} />
                <span className="text-surface-500 capitalize">{service.replace("_", " ")}</span>
              </div>
            ))}
            {healthLoading && <span className="text-xs text-surface-400">Checking services…</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Revenue Today"
          value={metricsLoading ? "…" : `₪${(metrics?.gmvToday ?? 0).toLocaleString()}`}
          changePercent={metrics?.gmvChange}
          changePeriodLabel="vs yesterday"
          variant="success"
          icon={<DollarSign className="w-4.5 h-4.5" />}
          sparklineData={[]}
          href="/payments"
        />
        <MetricCard
          label="Active Offers"
          value={metricsLoading ? "…" : String(metrics?.activeOffers ?? 0)}
          changePercent={metrics?.activeOffersChange}
          changePeriodLabel="vs last week"
          variant="primary"
          icon={<FileText className="w-4.5 h-4.5" />}
          sparklineData={[]}
          href="/offers"
        />
        <MetricCard
          label="Active Contractors"
          value={analyticsLoading || contractorsLoading ? "…" : String(analyticsData?.totalContractors ?? metrics?.pendingVerifications ?? 0)}
          variant="default"
          icon={<ShieldCheck className="w-4.5 h-4.5" />}
          href="/contractors"
        />
        <MetricCard
          label="Open Tickets"
          value={metricsLoading ? "…" : String(metrics?.openTickets ?? 0)}
          changePercent={metrics?.openTicketsChange}
          changePeriodLabel="vs last week"
          variant="warning"
          icon={<Ticket className="w-4.5 h-4.5" />}
          href="/escalations"
        />
        <MetricCard
          label="Pending Vetting"
          value={vettingLoading ? "…" : String(pendingVetting)}
          variant={pendingVetting > 0 ? "warning" : "default"}
          icon={<ShieldAlert className="w-4.5 h-4.5" />}
          href="/contractors?status=pending"
        />
        <MetricCard
          label="Pending Payments"
          value={paymentSummaryLoading ? "…" : String(pendingPayments)}
          variant={pendingPayments > 0 ? "warning" : "default"}
          icon={<CreditCard className="w-4.5 h-4.5" />}
          href="/payments?status=pending"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Pending Actions</h2>
          <div className="card divide-y divide-surface-100">
            {(paymentSummaryLoading || contractorsLoading || escalationsLoading) && pendingActions.length === 0 && (
              <div className="flex items-center justify-center py-8 text-surface-400 gap-2 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading pending actions…
              </div>
            )}
            {!paymentSummaryLoading && !contractorsLoading && !escalationsLoading && pendingActions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-surface-400 gap-2">
                <CheckCircle2 className="w-8 h-8 text-success-400" />
                <span className="text-sm">All caught up — no pending actions</span>
              </div>
            )}
            {pendingActions.map((action) => {
              const config = actionTypeIcon[action.type];
              const Icon = config.icon;
              return (
                <div key={action.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={clsx("flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0", config.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{action.title}</p>
                    <p className="text-xs text-surface-400">{action.subtitle}</p>
                  </div>
                  <Link href={action.href} className="btn-primary btn-sm flex-shrink-0">
                    <Eye className="w-3.5 h-3.5" />
                    {action.actionLabel}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-3">System Health</h2>
          <div className="card p-4 space-y-4">
            <ServiceHealthRow
              label="API Server"
              icon={<Server className="w-4 h-4" />}
              status={healthFetchError ? "down" : health !== undefined ? "healthy" : "unknown"}
            />
            <ServiceHealthRow
              label="Redis"
              icon={<Wifi className="w-4 h-4" />}
              status={healthServices.redis !== undefined ? (healthServices.redis ? "healthy" : "down") : "unknown"}
            />
            <ServiceHealthRow
              label="PostgreSQL"
              icon={<Database className="w-4 h-4" />}
              status={healthServices.postgres !== undefined ? (healthServices.postgres ? "healthy" : "down") : "unknown"}
            />
            <div className="pt-2 border-t border-surface-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-500">Overall uptime</span>
                <span className="font-semibold text-surface-700">{uptimeLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Agent Performance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {systemLoading && agentSummary.length === 0 &&
              AGENTS.map((agent) => (
                <div key={agent.key} className="card p-3.5 flex flex-col gap-2 animate-pulse">
                  <div className="h-3 w-20 rounded bg-surface-100" />
                  <div className="h-6 w-12 rounded bg-surface-100" />
                  <div className="h-3 w-24 rounded bg-surface-100" />
                </div>
              ))}
            {!systemLoading && agentSummary.length === 0 && (
              <div className="card p-4 text-sm text-surface-400 col-span-full text-center">No agent status available</div>
            )}
            {agentSummary.map((agent) => {
              const errorRate = agent.calls > 0 ? (agent.errors / agent.calls) * 100 : 0;
              return (
                <div key={agent.key} className="card p-3.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-700">{agent.name}</span>
                    <span
                      className={clsx(
                        "status-dot",
                        agent.status === "active" && "status-dot-healthy",
                        agent.status === "degraded" && "status-dot-degraded",
                        agent.status === "offline" && "status-dot-unhealthy",
                      )}
                    />
                  </div>
                  <div className="text-lg font-bold text-surface-900">{agent.calls.toLocaleString()}</div>
                  <div className="text-[11px] text-surface-400">calls &middot; {errorRate.toFixed(1)}% errors</div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-3">Recent Escalations</h2>
          <div className="card divide-y divide-surface-100">
            {escalationsLoading && recentEscalations.length === 0 && (
              <div className="p-4 text-sm text-surface-400 text-center">Loading escalations…</div>
            )}
            {!escalationsLoading && recentEscalations.length === 0 && (
              <div className="p-4 text-sm text-surface-400 text-center">No recent escalations</div>
            )}
            {recentEscalations.map((escalation) => (
              <div key={escalation.id} className="p-3.5 flex items-start gap-3">
                <span
                  className={clsx(
                    "badge mt-0.5",
                    escalation.priority === "urgent" && "badge-urgent",
                    escalation.priority === "high" && "badge-high",
                    escalation.priority === "normal" && "badge-normal",
                    escalation.priority === "low" && "badge-low",
                  )}
                >
                  {escalation.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700 truncate">{escalation.reason}</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {new Date(escalation.createdAt).toLocaleTimeString("en-IL", { hour: "2-digit", minute: "2-digit" })} &middot;{" "}
                    <span
                      className={clsx(
                        escalation.status === "open" && "text-warning-600",
                        escalation.status === "assigned" && "text-primary-600",
                        escalation.status === "resolved" && "text-success-600",
                      )}
                    >
                      {escalation.status}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AgentMetricsChart series={chartSeries} comparisonMode height={300} />

      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3">Activity Log</h2>
        <div className="card divide-y divide-surface-100">
          {activityLoading && activityLog.length === 0 && (
            <div className="p-4 text-sm text-surface-400 text-center">Loading activity…</div>
          )}
          {!activityLoading && activityLog.length === 0 && (
            <div className="p-4 text-sm text-surface-400 text-center">No activity yet</div>
          )}
          {activityLog.map((entry: ActivityLogEntry) => {
            const config = ACTIVITY_TYPE_ICON[entry.type];
            const Icon = config.icon;
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className={clsx("flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0", config.color)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700">{entry.message}</p>
                </div>
                <span className="text-xs text-surface-400 whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleTimeString("en-IL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ServiceHealthRow({
  label,
  icon,
  status,
}: {
  label: string;
  icon: React.ReactNode;
  status: "healthy" | "down" | "unknown";
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="text-surface-500">{icon}</div>
        <span className="text-sm font-medium text-surface-700">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "status-dot",
            status === "healthy" && "status-dot-healthy",
            status === "down" && "status-dot-unhealthy",
            status === "unknown" && "bg-surface-300",
          )}
        />
        <span
          className={clsx(
            "text-xs font-medium",
            status === "healthy" && "text-success-600",
            status === "down" && "text-danger-600",
            status === "unknown" && "text-surface-400",
          )}
        >
          {status === "healthy" ? "Operational" : status === "down" ? "Down" : "Unknown"}
        </span>
      </div>
    </div>
  );
}
