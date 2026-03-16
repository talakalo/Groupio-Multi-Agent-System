"use client";

import { clsx } from "clsx";
import {
  RefreshCw,
  GitBranch,
  Layers,
  Activity,
  Settings,
  Bot,
  Search,
  DollarSign,
  ShieldCheck,
  Headphones,
  Megaphone,
  BarChart3,
  LayoutGrid,
  CreditCard,
  Bell,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { AgentActivityLog, type AgentActivityEntry, type ActivityActionType } from "@/components/features/agents/AgentActivityLog";
import { AgentConfigPanel, type AgentConfig } from "@/components/features/agents/AgentConfigPanel";
import { AgentModeLabel, type AgentMode } from "@/components/features/agents/AgentModeLabel";
import { AgentOrchestrationGraph } from "@/components/features/agents/AgentOrchestrationGraph";
import { AgentStatusDot, type AgentHealthStatus } from "@/components/features/agents/AgentStatusDot";
import { PendingDecisionCard, type PendingDecision, type DecisionType } from "@/components/features/agents/PendingDecisionCard";
import { AgentMetricsChart } from "@/components/features/metrics/AgentMetricsChart";
import type { AgentChartSeries } from "@/components/features/metrics/AgentMetricsChart";
import {
  useSystemStatus,
  useAgentMetrics,
  useReloadAgent,
  useEscalations,
  useActivityLog,
} from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

const AGENT_DEFS = [
  { key: "router", name: "Router Agent", description: "Routes incoming user messages to the appropriate specialist agent based on intent classification." },
  { key: "matching", name: "Matching Agent", description: "Matches residents with verified contractors using RAG + graph DB scoring." },
  { key: "pricing", name: "Pricing Agent", description: "Calculates group-buy pricing tiers and market analysis for service categories." },
  { key: "vetting", name: "Vetting Agent", description: "Verifies contractor credentials, licenses, and computes trust scores." },
  { key: "support", name: "Support Agent", description: "Handles general customer support conversations and complaint resolution." },
  { key: "outreach", name: "Outreach Agent", description: "Manages contractor communications, onboarding, and engagement campaigns." },
  { key: "analytics", name: "Analytics Agent", description: "Generates insights, reports, and answers natural-language analytics queries." },
  { key: "architecture", name: "Architecture Agent", description: "Analyzes uploaded floor plans via Vision AI and suggests renovation services." },
  { key: "payment", name: "Payment Agent", description: "Handles payment queries, invoice generation, and refund processing." },
  { key: "notification", name: "Notification Agent", description: "Central hub for multi-channel notifications (email, WhatsApp, push, in-app)." },
] as const;

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  router: Bot,
  matching: Search,
  pricing: DollarSign,
  vetting: ShieldCheck,
  support: Headphones,
  outreach: Megaphone,
  analytics: BarChart3,
  architecture: LayoutGrid,
  payment: CreditCard,
  notification: Bell,
};

const CHART_COLORS = [
  "#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#a855f7",
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { data: systemStatus } = useSystemStatus();
  const reloadMutation = useReloadAgent();
  const { data: escalationsData } = useEscalations();
  const { data: auditActivity = [] } = useActivityLog();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [configPanel, setConfigPanel] = useState<AgentConfig | null>(null);

  // Agent modes & toggles — client state until backend supports persistence
  const [agentModes, setAgentModes] = useState<Record<string, AgentMode>>(
    () => Object.fromEntries(AGENT_DEFS.map((a) => [a.key, "auto" as AgentMode])),
  );
  const [agentToggles, setAgentToggles] = useState<Record<string, boolean>>(
    () => Object.fromEntries(AGENT_DEFS.map((a) => [a.key, true])),
  );

  const { data: agentDetail } = useAgentMetrics(selectedAgent ?? "router");

  // ---------------------------------------------------------------------------
  // Derive agent card data
  // ---------------------------------------------------------------------------

  const agentCards = useMemo(() => {
    return AGENT_DEFS.map((def) => {
      const sysAgent = systemStatus?.agents?.[def.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const errorRate = calls > 0 ? (errors / calls) * 100 : 0;
      const enabled = agentToggles[def.key];

      const healthStatus: AgentHealthStatus = !enabled
        ? "disabled"
        : errorRate > 5
          ? "error"
          : errorRate > 2
            ? "degraded"
            : "healthy";

      return {
        ...def,
        calls,
        errors,
        errorRate,
        healthStatus,
        enabled,
        mode: agentModes[def.key],
        avgResponseMs: sysAgent?.avgDurationMs ?? 0,
        requestsPerMin: +(calls / 1440).toFixed(1) || 0,
      };
    });
  }, [systemStatus, agentToggles, agentModes]);

  // ---------------------------------------------------------------------------
  // Pending decisions from escalations
  // ---------------------------------------------------------------------------

  const pendingDecisions: PendingDecision[] = useMemo(() => {
    const escalations = escalationsData?.escalations ?? [];
    const typeMap: Record<string, DecisionType> = {
      vetting: "vetting", outreach: "outreach", credit: "credit",
      payment: "payment", matching: "matching",
    };

    return escalations
      .filter((e) => e.status === "open")
      .slice(0, 5)
      .map((esc) => {
        const agentHint = esc.context?.actionsTaken?.[0]?.agent ?? "support";
        return {
          id: esc.id,
          agentName: agentHint.replace(/^\w/, (c: string) => c.toUpperCase()) + " Agent",
          type: typeMap[agentHint.toLowerCase()] ?? "matching",
          summary: esc.reason,
          reasoning: esc.context?.actionsTaken?.map((a: { action: string }) => a.action).join(". ") ?? "",
          createdAt: esc.created_at ?? new Date().toISOString(),
        };
      });
  }, [escalationsData]);

  // ---------------------------------------------------------------------------
  // Activity log mapping
  // ---------------------------------------------------------------------------

  const activityEntries: AgentActivityEntry[] = useMemo(() => {
    const typeMap: Record<string, ActivityActionType> = {
      agent: "api_call",
      escalation: "escalation",
      system: "config_change",
      contractor: "decision",
    };
    return auditActivity.map((entry) => ({
      id: entry.id,
      agentName: "System",
      actionType: typeMap[entry.type] ?? "api_call",
      timestamp: entry.timestamp,
      status: "success" as const,
      details: entry.message,
    }));
  }, [auditActivity]);

  // ---------------------------------------------------------------------------
  // Chart series
  // ---------------------------------------------------------------------------

  const chartSeries: AgentChartSeries[] = useMemo(() => {
    if (selectedAgent && agentDetail) {
      return [{
        agentKey: agentDetail.name,
        label: AGENT_DEFS.find((a) => a.key === agentDetail.name)?.name ?? agentDetail.name,
        color: CHART_COLORS[0],
        data: agentDetail.history.map((h) => ({
          timestamp: h.timestamp,
          calls: h.calls,
          avgLatencyMs: h.avgLatencyMs,
          errorRate: 0,
        })),
      }];
    }
    const now = new Date().toISOString();
    return AGENT_DEFS.map((def, idx) => {
      const sysAgent = systemStatus?.agents?.[def.key];
      const calls = sysAgent?.calls ?? 0;
      const errors = sysAgent?.errors ?? 0;
      const errorRate = calls > 0 ? +((errors / calls) * 100).toFixed(2) : 0;
      return {
        agentKey: def.key,
        label: def.name,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        data: [{ timestamp: now, calls, avgLatencyMs: 0, errorRate }],
      };
    });
  }, [selectedAgent, agentDetail, systemStatus]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleReload = useCallback(
    (agentKey: string) => reloadMutation.mutate(agentKey),
    [reloadMutation],
  );

  const handleToggle = useCallback((agentKey: string) => {
    setAgentToggles((prev) => ({ ...prev, [agentKey]: !prev[agentKey] }));
  }, []);

  const openConfig = useCallback((agentKey: string) => {
    const def = AGENT_DEFS.find((a) => a.key === agentKey);
    if (!def) return;
    setConfigPanel({
      id: agentKey,
      name: def.name,
      mode: agentModes[agentKey],
      enabled: agentToggles[agentKey],
      temperature: 0.7,
      customPrompt: "",
    });
  }, [agentModes, agentToggles]);

  const handleSaveConfig = useCallback((config: AgentConfig) => {
    setAgentModes((prev) => ({ ...prev, [config.id]: config.mode }));
    setAgentToggles((prev) => ({ ...prev, [config.id]: config.enabled }));
    setConfigPanel(null);
  }, []);

  const handleApproveDecision = useCallback((_id: string) => {
    // TODO: wire to escalation resolve API
  }, []);

  const handleRejectDecision = useCallback((_id: string) => {
    // TODO: wire to escalation reject API
  }, []);

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Agent Management</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Monitor, configure, and manage the {AGENT_DEFS.length} Groupio AI agents
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setSelectedAgent(null)}>
          <RefreshCw className="w-4 h-4" />
          View All Agents
        </button>
      </div>

      {/* ================================================================== */}
      {/* Agent Cards Grid                                                    */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {agentCards.map((agent) => {
          const Icon = AGENT_ICONS[agent.key] ?? Bot;
          return (
            <div
              key={agent.key}
              role="button"
              tabIndex={0}
              className={clsx(
                "card card-hover p-5 cursor-pointer transition-all duration-150",
                selectedAgent === agent.key ? "ring-2 ring-primary-500 ring-offset-2" : "ring-0",
                !agent.enabled && "opacity-60",
              )}
              onClick={() => setSelectedAgent((prev) => (prev === agent.key ? null : agent.key))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedAgent((prev) => (prev === agent.key ? null : agent.key));
                }
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
                      {agent.name}
                      <AgentStatusDot status={agent.healthStatus} />
                    </h3>
                    <AgentModeLabel mode={agent.mode} />
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openConfig(agent.key); }}
                  className="btn-ghost p-1.5 rounded-lg"
                  title="Configure agent"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {/* Description */}
              <p className="text-xs text-surface-500 mb-3 line-clamp-2">
                {agent.description}
              </p>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] font-medium text-surface-400 uppercase">Calls</p>
                  <p className="text-sm font-semibold text-surface-800">{agent.calls}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-surface-400 uppercase">Latency</p>
                  <p className="text-sm font-semibold text-surface-800">{agent.avgResponseMs}ms</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-surface-400 uppercase">Errors</p>
                  <p className={clsx(
                    "text-sm font-semibold",
                    agent.errorRate > 5 ? "text-danger-600" : agent.errorRate > 2 ? "text-warning-600" : "text-surface-800",
                  )}>
                    {agent.errorRate.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Card footer actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-100">
                <button
                  onClick={(e) => { e.stopPropagation(); handleReload(agent.key); }}
                  className="btn-ghost btn-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reload
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggle(agent.key); }}
                  className={clsx(
                    "btn-sm ms-auto rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                    agent.enabled
                      ? "bg-success-50 text-success-700 hover:bg-success-100"
                      : "bg-surface-100 text-surface-500 hover:bg-surface-200",
                  )}
                >
                  {agent.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          );
        })}
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
      {/* LangGraph Orchestration Flow                                        */}
      {/* TODO: Make this interactive (click nodes to configure) in a future iteration */}
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
      {/* Pending Decisions                                                    */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-500" />
          Pending Agent Decisions
          {pendingDecisions.length > 0 && (
            <span className="badge bg-amber-100 text-amber-700">{pendingDecisions.length}</span>
          )}
        </h2>
        <p className="text-xs text-surface-400 mb-4">
          Agent actions that require admin review or override
        </p>
        {pendingDecisions.length === 0 ? (
          <div className="card py-8 text-center text-sm text-surface-400">
            No pending decisions — all agents are operating autonomously
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingDecisions.map((decision) => (
              <PendingDecisionCard
                key={decision.id}
                decision={decision}
                onApprove={handleApproveDecision}
                onReject={handleRejectDecision}
              />
            ))}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Agent Activity Log                                                   */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-surface-400" />
          Agent Activity Log
        </h2>
        <AgentActivityLog
          entries={activityEntries}
          agentNames={AGENT_DEFS.map((a) => a.name)}
        />
      </div>

      {/* ================================================================== */}
      {/* Config Panel (slide-out)                                             */}
      {/* ================================================================== */}
      <AgentConfigPanel
        agent={configPanel}
        open={configPanel !== null}
        onClose={() => setConfigPanel(null)}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
