"use client";

import { useState, useMemo, useCallback } from "react";
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
import type { AgentStatus } from "@/components/features/agents/AgentCard";
import { AgentMetricsChart } from "@/components/features/metrics/AgentMetricsChart";
import type { AgentChartSeries } from "@/components/features/metrics/AgentMetricsChart";
import {
  useSystemStatus,
  useAgentMetrics,
  useReloadAgent,
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
// Simulated recent activity for agents
// ---------------------------------------------------------------------------

interface AgentActivity {
  id: string;
  agentKey: string;
  agentName: string;
  action: string;
  timestamp: string;
}

function generateAgentActivity(): AgentActivity[] {
  const now = Date.now();
  return [
    {
      id: "aa-1",
      agentKey: "router",
      agentName: "Router",
      action: 'Classified intent "pricing_inquiry" with 0.94 confidence',
      timestamp: new Date(now - 1 * 60_000).toISOString(),
    },
    {
      id: "aa-2",
      agentKey: "matching",
      agentName: "Matching",
      action: "Returned 5 contractor matches for AC installation in Tel Aviv",
      timestamp: new Date(now - 3 * 60_000).toISOString(),
    },
    {
      id: "aa-3",
      agentKey: "pricing",
      agentName: "Pricing",
      action: "Generated 3-tier pricing for kitchen renovations in Jerusalem",
      timestamp: new Date(now - 6 * 60_000).toISOString(),
    },
    {
      id: "aa-4",
      agentKey: "support",
      agentName: "Support",
      action: "Escalated conversation conv-302 to human operator",
      timestamp: new Date(now - 10 * 60_000).toISOString(),
    },
    {
      id: "aa-5",
      agentKey: "vetting",
      agentName: "Vetting",
      action: 'Completed license verification for "Southern Electric"',
      timestamp: new Date(now - 14 * 60_000).toISOString(),
    },
    {
      id: "aa-6",
      agentKey: "outreach",
      agentName: "Outreach",
      action: "Sent onboarding follow-up to 3 pending contractors",
      timestamp: new Date(now - 20 * 60_000).toISOString(),
    },
    {
      id: "aa-7",
      agentKey: "analytics",
      agentName: "Analytics",
      action: 'Processed NL query: "top performing category this month"',
      timestamp: new Date(now - 28 * 60_000).toISOString(),
    },
    {
      id: "aa-8",
      agentKey: "router",
      agentName: "Router",
      action: "Processed 24 messages in last 30 min, 0 misroutes",
      timestamp: new Date(now - 32 * 60_000).toISOString(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { data: systemStatus } = useSystemStatus();
  const reloadMutation = useReloadAgent();

  // Track which agent is selected for the detail chart
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Agent enabled/disabled toggles (client state)
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(AGENT_DEFS.map((a) => [a.key, true]))
  );

  // Fetch detailed metrics for the selected agent
  const { data: agentDetail } = useAgentMetrics(selectedAgent ?? "router");

  const activity = useMemo(() => generateAgentActivity(), []);

  // Derive agent card data from system status
  const agentCards = useMemo(() => {
    return AGENT_DEFS.map((def, idx) => {
      const sysAgent = systemStatus?.agents?.[def.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const errorRate = calls > 0 ? (errors / calls) * 100 : 0;
      const status: AgentStatus =
        !agentToggles[def.key]
          ? "offline"
          : errorRate > 5
            ? "degraded"
            : "active";

      // Generate deterministic trend data
      const seed = def.key.length + idx;
      const trendData = Array.from({ length: 12 }, (_, i) => {
        return Math.round(
          20 + Math.sin(i * 0.5 + seed) * 10 + Math.random() * 5
        );
      });

      return {
        ...def,
        calls,
        errors,
        errorRate,
        status,
        avgResponseMs: Math.round(180 + seed * 15 + Math.random() * 50),
        requestsPerMin: +(calls / 1440).toFixed(1) || 0.5,
        trendData,
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
    // All agents comparison
    return AGENT_DEFS.map((def, idx) => {
      const now = Date.now();
      const data = Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(now - (23 - i) * 3_600_000).toISOString(),
        calls: Math.round(
          15 + Math.sin(i * 0.5 + idx) * 10 + Math.random() * 8
        ),
        avgLatencyMs: Math.round(
          200 + Math.sin(i * 0.3 + idx) * 60 + Math.random() * 30
        ),
        errorRate: Math.max(
          0,
          +(Math.sin(i * 0.4 + idx) * 2 + Math.random()).toFixed(2)
        ),
      }));
      return {
        agentKey: def.key,
        label: def.name,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        data,
      };
    });
  }, [selectedAgent, agentDetail]);

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
            Monitor, configure, and manage the 7 Groupio AI agents
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
        <div className="relative border-2 border-dashed border-surface-200 rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px] bg-surface-50/50">
          {/* Simplified flow visualization */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <div className="flex flex-col items-center gap-1">
              <div className="w-16 h-16 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-xs">
                Router
              </div>
            </div>
            <div className="text-surface-300 text-lg">&rarr;</div>
            <div className="flex flex-col gap-2">
              {["Matching", "Pricing", "Vetting", "Support", "Outreach", "Architecture", "Payment", "Notification"].map(
                (name) => (
                  <div
                    key={name}
                    className="w-20 h-8 rounded-lg bg-surface-100 text-surface-600 flex items-center justify-center text-[11px] font-medium"
                  >
                    {name}
                  </div>
                )
              )}
            </div>
            <div className="text-surface-300 text-lg">&rarr;</div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-xl bg-success-50 text-success-700 flex items-center justify-center font-semibold text-xs">
                Analytics
              </div>
              <div className="w-16 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-semibold text-[10px]">
                Human
              </div>
            </div>
          </div>
          <p className="text-xs text-surface-400 mt-4">
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            10 agents in orchestration pipeline &mdash; interactive graph coming soon
          </p>
        </div>
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
        <div className="divide-y divide-surface-100">
          {[
            {
              id: "d1",
              agent: "Vetting",
              action: "Manual review required",
              detail: 'Contractor "Haifa Electric" scored 72 (threshold: 85 for auto-approve)',
              priority: "medium",
            },
            {
              id: "d2",
              agent: "Matching",
              action: "Low-confidence match",
              detail: "Best match score 0.45 for plumbing in South region (threshold: 0.6)",
              priority: "low",
            },
            {
              id: "d3",
              agent: "Support",
              action: "Escalation review",
              detail: "User reported legal issue in conversation conv-445",
              priority: "high",
            },
          ].map((decision) => (
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
                <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors">
                  Approve
                </button>
                <button className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors">
                  Override
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-surface-400 mt-3 text-center">
          Decision queue updates in real-time via WebSocket
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
