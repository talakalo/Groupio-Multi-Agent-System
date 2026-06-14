"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { clsx } from "clsx";
import {
  RefreshCw,
  GitBranch,
  Layers,
  Clock,
  Activity,
  Filter,
} from "lucide-react";
import { AgentCard } from "@/components/features/agents/AgentCard";
import { AgentOrchestrationGraph } from "@/components/features/agents/AgentOrchestrationGraph";
import type { AgentStatus } from "@/components/features/agents/AgentCard";
import { AgentMetricsChart } from "@/components/features/metrics/AgentMetricsChart";
import type { AgentChartSeries } from "@/components/features/metrics/AgentMetricsChart";
import {
  useSystemStatus,
  useAgentMetrics,
  useReloadAgent,
  useActivityLog,
  usePendingDecisions,
  useApprovePendingDecision,
  useRejectPendingDecision,
  useAgentAutonomy,
  useUpdateAgentMode,
} from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

const AGENT_DEFS = [
  {
    key: "router",
    name: "Router Agent",
    description:
      "Routes incoming user messages to the appropriate specialist agent based on intent classification.",
  },
  {
    key: "matching",
    name: "Matching Agent",
    description:
      "Matches residents with verified contractors using RAG + graph DB scoring.",
  },
  {
    key: "pricing",
    name: "Pricing Agent",
    description:
      "Calculates group-buy pricing tiers and market analysis for service categories.",
  },
  {
    key: "vetting",
    name: "Vetting Agent",
    description:
      "Verifies contractor credentials, licenses, and computes trust scores.",
  },
  {
    key: "support",
    name: "Support Agent",
    description:
      "Handles general customer support conversations and complaint resolution.",
  },
  {
    key: "outreach",
    name: "Outreach Agent",
    description:
      "Manages contractor communications, onboarding, and engagement campaigns.",
  },
  {
    key: "influencer",
    name: "Influencer Agent",
    description:
      "Coordinates influencer partnerships and campaign attribution.",
  },
  {
    key: "analytics",
    name: "Analytics Agent",
    description:
      "Generates insights, reports, and answers natural-language analytics queries.",
  },
  {
    key: "architecture",
    name: "Architecture Agent",
    description:
      "Analyzes uploaded floor plans via Vision AI and suggests renovation services.",
  },
  {
    key: "payment",
    name: "Payment Agent",
    description:
      "Handles payment queries, invoice generation, and refund processing.",
  },
  {
    key: "notification",
    name: "Notification Agent",
    description:
      "Central hub for multi-channel notifications (email, WhatsApp, push, in-app).",
  },
] as const;

const CHART_COLORS = [
  "#4f46e5",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#a855f7",
];

// ---------------------------------------------------------------------------
// Agent activity type (sourced from audit logs)
// ---------------------------------------------------------------------------

interface AgentActivity {
  id: string;
  agentKey: string;
  agentName: string;
  action: string;
  timestamp: string;
}

interface PendingDecisionRow {
  id: string;
  agent: string;
  action: string;
  detail: string;
  priority: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { data: systemStatus } = useSystemStatus();
  const reloadMutation = useReloadAgent();
  const { data: pendingDecisionsData, isLoading: pendingDecisionsLoading } = usePendingDecisions();
  const approveDecision = useApprovePendingDecision();
  const rejectDecision = useRejectPendingDecision();
  const [decisionBanner, setDecisionBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    if (!decisionBanner) return;
    const t = setTimeout(() => setDecisionBanner(null), 5000);
    return () => clearTimeout(t);
  }, [decisionBanner]);

  // Track which agent is selected for the detail chart
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Agent enabled/disabled toggles (client state)
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(AGENT_DEFS.map((a) => [a.key, true]))
  );

  // Fetch detailed metrics for the selected agent
  const { data: agentDetail } = useAgentMetrics(selectedAgent ?? "router");
  const { data: auditActivity = [] } = useActivityLog();

  // Map audit log entries to agent activity format
  const activity: AgentActivity[] = useMemo(() => {
    return auditActivity.map((entry) => ({
      id: entry.id,
      agentKey: "system",
      agentName: "System",
      action: entry.message,
      timestamp: entry.timestamp,
    }));
  }, [auditActivity]);

  const pendingDecisions = useMemo((): PendingDecisionRow[] => {
    const items = pendingDecisionsData?.items ?? [];
    return items.slice(0, 20).map((d) => ({
      id: d.id,
      agent: d.agent_name || "Agent",
      action: d.action_type || "pending_action",
      detail: d.escalation_reason || "",
      priority: "medium" as const,
    }));
  }, [pendingDecisionsData]);

  // Derive agent card data from system status
  const agentCards = useMemo(() => {
    return AGENT_DEFS.map((def, idx) => {
      const sysAgent = systemStatus?.agents?.[def.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const avgResponseMs = sysAgent?.avgDurationMs ?? 0;
      const errorRate = calls > 0 ? (errors / calls) * 100 : 0;
      const status: AgentStatus =
        !agentToggles[def.key]
          ? "offline"
          : errorRate > 5
            ? "degraded"
            : "active";

      return {
        ...def,
        calls,
        errors,
        errorRate,
        status,
        avgResponseMs,
        requestsPerMin: +(calls / 1440).toFixed(1) || 0,
        trendData: calls > 0 ? [calls] : [0],
      };
    });
  }, [systemStatus, agentToggles]);

  // Build chart series for the selected or all agents
  const chartSeries: AgentChartSeries[] = useMemo(() => {
    if (selectedAgent && agentDetail) {
      return [
        {
          agentKey: agentDetail.name,
          label:
            AGENT_DEFS.find((a) => a.key === agentDetail.name)?.name ??
            agentDetail.name,
          color: CHART_COLORS[0],
          data: agentDetail.history.map((h) => ({
            timestamp: h.timestamp,
            calls: h.calls,
            avgLatencyMs: h.avgLatencyMs,
            errorRate: Math.max(0, +(Math.random() * 2).toFixed(2)),
          })),
        },
      ];
    }
    // All agents comparison (single data point per agent from current status)
    const now = new Date().toISOString();
    return AGENT_DEFS.map((def, idx) => {
      const sysAgent = systemStatus?.agents?.[def.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const errorRate = calls > 0 ? +((errors / calls) * 100).toFixed(2) : 0;
      const avgMs = sysAgent?.avgDurationMs ?? 0;
      return {
        agentKey: def.key,
        label: def.name,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        data: [{ timestamp: now, calls, avgLatencyMs: avgMs, errorRate }],
      };
    });
  }, [selectedAgent, agentDetail, systemStatus]);

  const handleReload = useCallback(
    (agentKey: string) => {
      reloadMutation.mutate(agentKey);
    },
    [reloadMutation]
  );

  const handleToggle = useCallback((agentKey: string) => {
    setAgentToggles((prev) => ({ ...prev, [agentKey]: !prev[agentKey] }));
  }, []);

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">
            Agent Management
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Monitor, configure, and manage Groupio AI agents
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => setSelectedAgent(null)}
        >
          <RefreshCw className="w-4 h-4" />
          View All Agents
        </button>
      </div>

      {/* ================================================================== */}
      {/* Agent Cards Grid                                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {agentCards.map((agent) => (
          <div
            key={agent.key}
            className={clsx(
              "cursor-pointer rounded-xl transition-all duration-150",
              selectedAgent === agent.key
                ? "ring-2 ring-primary-500 ring-offset-2"
                : "ring-0"
            )}
            onClick={() =>
              setSelectedAgent((prev) =>
                prev === agent.key ? null : agent.key
              )
            }
          >
            <AgentCard
              agentKey={agent.key}
              name={agent.name}
              status={agent.status}
              avgResponseMs={agent.avgResponseMs}
              requestsPerMin={agent.requestsPerMin}
              errorRate={agent.errorRate}
              trendData={agent.trendData}
              totalCalls={agent.calls}
              enabled={agentToggles[agent.key]}
              onReload={handleReload}
              onConfigure={() => handleToggle(agent.key)}
            />
          </div>
        ))}
      </div>

      {/* ================================================================== */}
      {/* Agent Configuration Toggles                                         */}
      {/* ================================================================== */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-surface-900 mb-4 flex items-center gap-2">
          <Filter className="w-4 h-4 text-surface-400" />
          Agent Configuration
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          {AGENT_DEFS.map((def) => (
            <div key={def.key} className="flex items-center gap-3">
              <button
                onClick={() => handleToggle(def.key)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                  agentToggles[def.key] ? "bg-primary-600" : "bg-surface-300"
                )}
                role="switch"
                aria-checked={agentToggles[def.key]}
                aria-label={`Toggle ${def.name}`}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                    agentToggles[def.key] ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-sm text-surface-700">{def.name.replace(" Agent", "")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Performance Chart                                                   */}
      {/* ================================================================== */}
      <AgentMetricsChart
        series={chartSeries}
        comparisonMode={!selectedAgent}
        height={320}
      />

      {/* ================================================================== */}
      {/* LangGraph Orchestration Flow Placeholder                           */}
      {/* ================================================================== */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-surface-900 mb-2 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-surface-400" />
          LangGraph Orchestration Flow
        </h2>
        <p className="text-xs text-surface-400 mb-4">
          Visual representation of the agent orchestration pipeline
        </p>
        <AgentOrchestrationGraph selectedAgent={selectedAgent} />
      </div>

      {/* ================================================================== */}
      {/* Agent Decision Queue (actions needing admin review)                 */}
      {/* ================================================================== */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-500" />
          Pending Agent Decisions
        </h2>
        <p className="text-xs text-surface-400 mb-4">
          Agent actions that require admin review or override
        </p>
        {decisionBanner && (
          <div
            role="status"
            className={clsx(
              "mb-3 rounded-lg px-3 py-2 text-sm",
              decisionBanner.kind === "ok"
                ? "bg-emerald-50 text-emerald-900"
                : "bg-red-50 text-red-900"
            )}
          >
            {decisionBanner.text}
          </div>
        )}
        <div className="divide-y divide-surface-100">
          {pendingDecisionsLoading && (
            <div className="py-6 text-center text-sm text-surface-400">Loading pending decisions…</div>
          )}
          {!pendingDecisionsLoading && pendingDecisions.length === 0 && (
            <div className="py-6 text-center text-sm text-surface-400">
              No pending decisions
            </div>
          )}
          {!pendingDecisionsLoading &&
            pendingDecisions.map((decision: PendingDecisionRow) => (
            <div key={decision.id} className="flex items-center gap-3 py-3">
              <span
                className={clsx(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  decision.priority === "high" && "bg-red-500",
                  decision.priority === "medium" && "bg-amber-500",
                  decision.priority === "low" && "bg-green-500"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-700">
                  <span className="font-medium text-surface-900">{decision.agent}</span>
                  {" \u2014 "}
                  {decision.action}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">{decision.detail}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  disabled={actingId === decision.id || approveDecision.isPending || rejectDecision.isPending}
                  onClick={async () => {
                    setActingId(decision.id);
                    try {
                      await approveDecision.mutateAsync({ decisionId: decision.id });
                      setDecisionBanner({ kind: "ok", text: "Decision approved." });
                    } catch {
                      setDecisionBanner({ kind: "err", text: "Approve failed. Check network or permissions." });
                    } finally {
                      setActingId(null);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actingId === decision.id || approveDecision.isPending || rejectDecision.isPending}
                  onClick={async () => {
                    setActingId(decision.id);
                    try {
                      await rejectDecision.mutateAsync({ decisionId: decision.id, note: "rejected_by_admin" });
                      setDecisionBanner({ kind: "ok", text: "Decision rejected." });
                    } catch {
                      setDecisionBanner({ kind: "err", text: "Reject failed. Check network or permissions." });
                    } finally {
                      setActingId(null);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-surface-400 mt-3 text-center">
          Queue refreshes automatically every 30 seconds
        </p>
      </div>

      {/* ================================================================== */}
      {/* Recent Agent Activity Log                                           */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-surface-400" />
          Recent Agent Activity
        </h2>
        <div className="card divide-y divide-surface-100">
          {activity.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-50 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0">
                <span className="text-[10px] font-bold uppercase">
                  {entry.agentKey.slice(0, 3)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-surface-700">
                  <span className="font-medium text-surface-900">
                    {entry.agentName}
                  </span>{" "}
                  &mdash; {entry.action}
                </p>
              </div>
              <span className="text-xs text-surface-400 whitespace-nowrap flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(entry.timestamp).toLocaleTimeString("en-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
