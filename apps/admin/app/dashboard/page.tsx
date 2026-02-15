"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import {
  DollarSign,
  FileText,
  ShieldCheck,
  Ticket,
  Activity,
  Server,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { MetricCard } from "@/components/features/metrics/MetricCard";
import { AgentMetricsChart } from "@/components/features/metrics/AgentMetricsChart";
import type { AgentChartSeries } from "@/components/features/metrics/AgentMetricsChart";
import {
  useDashboardMetrics,
  useSystemStatus,
  useEscalations,
  useHealthStatus,
  useAdminAnalyticsDashboard,
} from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Agent definitions (the 7 agents in the Groupio system)
// ---------------------------------------------------------------------------

const AGENTS = [
  { key: "router", name: "Router" },
  { key: "matching", name: "Matching" },
  { key: "pricing", name: "Pricing" },
  { key: "vetting", name: "Vetting" },
  { key: "support", name: "Support" },
  { key: "outreach", name: "Outreach" },
  { key: "analytics", name: "Analytics" },
] as const;

// ---------------------------------------------------------------------------
// Mock activity log entries
// ---------------------------------------------------------------------------

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: "agent" | "escalation" | "contractor" | "system";
  message: string;
}

function generateActivityLog(): ActivityLogEntry[] {
  const now = Date.now();
  return [
    {
      id: "act-1",
      timestamp: new Date(now - 2 * 60_000).toISOString(),
      type: "agent",
      message: "Router agent routed pricing inquiry to Pricing agent",
    },
    {
      id: "act-2",
      timestamp: new Date(now - 5 * 60_000).toISOString(),
      type: "escalation",
      message: "Escalation ESC-003 created: contractor license expired",
    },
    {
      id: "act-3",
      timestamp: new Date(now - 8 * 60_000).toISOString(),
      type: "contractor",
      message: 'New contractor "Sharon Kitchen Design" verified',
    },
    {
      id: "act-4",
      timestamp: new Date(now - 12 * 60_000).toISOString(),
      type: "agent",
      message: "Matching agent processed 14 match requests (avg 280ms)",
    },
    {
      id: "act-5",
      timestamp: new Date(now - 18 * 60_000).toISOString(),
      type: "system",
      message: "Vector DB reindexing completed for contractors collection",
    },
    {
      id: "act-6",
      timestamp: new Date(now - 25 * 60_000).toISOString(),
      type: "agent",
      message: "Support agent handled 6 conversations, 1 escalated",
    },
    {
      id: "act-7",
      timestamp: new Date(now - 35 * 60_000).toISOString(),
      type: "escalation",
      message: "Escalation ESC-002 assigned to human operator",
    },
    {
      id: "act-8",
      timestamp: new Date(now - 42 * 60_000).toISOString(),
      type: "contractor",
      message: "Trust score recalculated for 12 contractors",
    },
  ];
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: metrics } = useDashboardMetrics();
  const { data: systemStatus } = useSystemStatus();
  const { data: escalationsData } = useEscalations();
  const { data: health } = useHealthStatus();
  const { data: analyticsData } = useAdminAnalyticsDashboard();

  const activityLog = useMemo(() => generateActivityLog(), []);

  // Derive agent summary data from system status
  const agentSummary = useMemo(() => {
    if (!systemStatus?.agents) return [];
    return AGENTS.map((a) => {
      const data = systemStatus.agents[a.key];
      if (!data) {
        return { ...a, calls: 0, errors: 0, status: "offline" as const };
      }
      const errorRate =
        data.calls > 0 ? (data.errors / data.calls) * 100 : 0;
      const status: "active" | "degraded" | "offline" =
        errorRate > 5 ? "degraded" : "active";
      return { ...a, calls: data.calls, errors: data.errors, status };
    });
  }, [systemStatus]);

  // Build chart series from system status
  const chartSeries: AgentChartSeries[] = useMemo(() => {
    const colors = [
      "#4f46e5",
      "#22c55e",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#ec4899",
    ];
    return AGENTS.map((agent, idx) => {
      const now = Date.now();
      const data = Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(now - (23 - i) * 3_600_000).toISOString(),
        calls: Math.round(15 + Math.sin(i * 0.5 + idx) * 10 + Math.random() * 8),
        avgLatencyMs: Math.round(
          200 + Math.sin(i * 0.3 + idx) * 60 + Math.random() * 30
        ),
        errorRate: Math.max(
          0,
          +(Math.sin(i * 0.4 + idx) * 2 + Math.random()).toFixed(2)
        ),
      }));
      return {
        agentKey: agent.key,
        label: agent.name,
        color: colors[idx % colors.length],
        data,
      };
    });
  }, []);

  // Recent escalations (up to 5)
  const recentEscalations = useMemo(() => {
    if (!escalationsData?.escalations) return [];
    return [...escalationsData.escalations]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 5);
  }, [escalationsData]);

  // Health bar metrics
  const healthServices = health?.services ?? {};
  const allServicesUp = Object.values(healthServices).every(Boolean);
  const uptimePercent = allServicesUp ? 99.97 : 98.5;

  // Sparkline data (simulated)
  const gmvSparkline = Array.from({ length: 14 }, (_, i) => ({
    value: 30_000 + Math.sin(i * 0.6) * 8_000 + Math.random() * 5_000,
  }));
  const offersSparkline = Array.from({ length: 14 }, (_, i) => ({
    value: 20 + Math.sin(i * 0.5) * 8 + Math.random() * 6,
  }));

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div>
        <h1 className="text-xl font-bold text-surface-900">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          System overview and real-time monitoring
        </p>
      </div>

      {/* ================================================================== */}
      {/* System Health Bar                                                   */}
      {/* ================================================================== */}
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "status-dot",
                  allServicesUp ? "status-dot-healthy" : "status-dot-degraded"
                )}
              />
              <span className="text-sm font-semibold text-surface-800">
                System {allServicesUp ? "Healthy" : "Degraded"}
              </span>
            </div>
            <div className="h-5 w-px bg-surface-200" />
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Activity className="w-3.5 h-3.5" />
              <span>
                Uptime:{" "}
                <span className="font-semibold text-surface-700">
                  {uptimePercent}%
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Clock className="w-3.5 h-3.5" />
              <span>
                API Latency:{" "}
                <span className="font-semibold text-surface-700">124ms</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Error Rate:{" "}
                <span className="font-semibold text-surface-700">0.24%</span>
              </span>
            </div>
          </div>
          {/* Service status dots */}
          <div className="flex items-center gap-3">
            {Object.entries(healthServices).map(([svc, up]) => (
              <div key={svc} className="flex items-center gap-1.5 text-xs">
                <span
                  className={clsx(
                    "status-dot",
                    up ? "status-dot-healthy" : "status-dot-unhealthy"
                  )}
                />
                <span className="text-surface-500 capitalize">
                  {svc.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Key Metrics Cards                                                   */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Revenue Today"
          value={`\u20AA${(metrics?.gmvToday ?? 0).toLocaleString()}`}
          changePercent={metrics?.gmvChange}
          changePeriodLabel="vs yesterday"
          variant="success"
          icon={<DollarSign className="w-4.5 h-4.5" />}
          sparklineData={gmvSparkline}
        />
        <MetricCard
          label="Active Offers"
          value={String(metrics?.activeOffers ?? 0)}
          changePercent={metrics?.activeOffersChange}
          changePeriodLabel="vs last week"
          variant="primary"
          icon={<FileText className="w-4.5 h-4.5" />}
          sparklineData={offersSparkline}
        />
        <MetricCard
          label="Active Contractors"
          value={String(analyticsData?.totalContractors ?? metrics?.pendingVerifications ?? 0)}
          variant="default"
          icon={<ShieldCheck className="w-4.5 h-4.5" />}
        />
        <MetricCard
          label="Open Tickets"
          value={String(metrics?.openTickets ?? 0)}
          changePercent={metrics?.openTicketsChange}
          changePeriodLabel="vs last week"
          variant="warning"
          icon={<Ticket className="w-4.5 h-4.5" />}
        />
      </div>

      {/* ================================================================== */}
      {/* Agent Performance Summary + Recent Escalations                     */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent cards grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-surface-900 mb-3">
            Agent Performance
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {agentSummary.map((agent) => {
              const errorRate =
                agent.calls > 0
                  ? (agent.errors / agent.calls) * 100
                  : 0;
              return (
                <div
                  key={agent.key}
                  className="card p-3.5 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-surface-700">
                      {agent.name}
                    </span>
                    <span
                      className={clsx(
                        "status-dot",
                        agent.status === "active" && "status-dot-healthy",
                        agent.status === "degraded" && "status-dot-degraded",
                        agent.status === "offline" && "status-dot-unhealthy"
                      )}
                    />
                  </div>
                  <div className="text-lg font-bold text-surface-900">
                    {agent.calls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-surface-400">
                    calls &middot; {errorRate.toFixed(1)}% errors
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent escalations feed */}
        <div>
          <h2 className="text-sm font-semibold text-surface-900 mb-3">
            Recent Escalations
          </h2>
          <div className="card divide-y divide-surface-100">
            {recentEscalations.length === 0 && (
              <div className="p-4 text-sm text-surface-400 text-center">
                No recent escalations
              </div>
            )}
            {recentEscalations.map((esc) => (
              <div key={esc.id} className="p-3.5 flex items-start gap-3">
                <span
                  className={clsx(
                    "badge mt-0.5",
                    esc.priority === "urgent" && "badge-urgent",
                    esc.priority === "high" && "badge-high",
                    esc.priority === "normal" && "badge-normal",
                    esc.priority === "low" && "badge-low"
                  )}
                >
                  {esc.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700 truncate">
                    {esc.reason}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {new Date(esc.createdAt).toLocaleTimeString("en-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    &middot;{" "}
                    <span
                      className={clsx(
                        esc.status === "open" && "text-warning-600",
                        esc.status === "assigned" && "text-primary-600",
                        esc.status === "resolved" && "text-success-600"
                      )}
                    >
                      {esc.status}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Agent Performance Chart                                             */}
      {/* ================================================================== */}
      <AgentMetricsChart
        series={chartSeries}
        comparisonMode
        height={300}
      />

      {/* ================================================================== */}
      {/* Real-Time Activity Log                                              */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3">
          Activity Log
        </h2>
        <div className="card divide-y divide-surface-100">
          {activityLog.map((entry) => {
            const cfg = ACTIVITY_TYPE_ICON[entry.type];
            const Icon = cfg.icon;
            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={clsx(
                    "flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0",
                    cfg.color
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-700">{entry.message}</p>
                </div>
                <span className="text-xs text-surface-400 whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleTimeString("en-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
