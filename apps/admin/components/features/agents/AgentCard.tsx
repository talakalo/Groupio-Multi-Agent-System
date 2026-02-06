"use client";

import { clsx } from "clsx";
import {
  Activity,
  Clock,
  Zap,
  AlertCircle,
  RotateCw,
  Settings,
  Bot,
  Search,
  DollarSign,
  ShieldCheck,
  Headphones,
  Megaphone,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = "active" | "degraded" | "offline";

export interface AgentCardProps {
  /** Machine-readable agent key (e.g. "router", "matching") */
  agentKey: string;
  /** Human-readable display name */
  name: string;
  /** Current operational status */
  status: AgentStatus;
  /** Average response time in milliseconds */
  avgResponseMs: number;
  /** Requests processed per minute */
  requestsPerMin: number;
  /** Error rate as a percentage (0-100) */
  errorRate: number;
  /** Last 12 data points for the mini trend chart */
  trendData?: number[];
  /** Whether the agent is currently enabled */
  enabled?: boolean;
  /** Called when the reload/restart button is clicked */
  onReload?: (agentKey: string) => void;
  /** Called when the configure button is clicked */
  onConfigure?: (agentKey: string) => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  AgentStatus,
  { dotClass: string; label: string; badgeClass: string }
> = {
  active: {
    dotClass: "status-dot-healthy",
    label: "Active",
    badgeClass: "bg-success-50 text-success-700",
  },
  degraded: {
    dotClass: "status-dot-degraded",
    label: "Degraded",
    badgeClass: "bg-warning-50 text-warning-700",
  },
  offline: {
    dotClass: "status-dot-unhealthy",
    label: "Offline",
    badgeClass: "bg-danger-50 text-danger-700",
  },
};

/** Map agent key to a relevant icon. */
const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
  {
    router: Bot,
    matching: Search,
    pricing: DollarSign,
    vetting: ShieldCheck,
    support: Headphones,
    outreach: Megaphone,
    analytics: BarChart3,
  };

/** Tiny inline SVG bar chart for trend visualisation. */
function MiniTrend({ data }: { data: number[] }) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 1);
  const barWidth = 4;
  const gap = 2;
  const height = 28;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-7"
      aria-hidden="true"
    >
      {data.map((v, i) => {
        const barHeight = Math.max((v / max) * height, 1);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            className="fill-primary-400"
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentCard({
  agentKey,
  name,
  status,
  avgResponseMs,
  requestsPerMin,
  errorRate,
  trendData = [],
  enabled = true,
  onReload,
  onConfigure,
  className,
}: AgentCardProps) {
  const statusCfg = STATUS_CONFIG[status];
  const Icon = AGENT_ICONS[agentKey] ?? Bot;

  return (
    <div
      className={clsx(
        "card card-hover flex flex-col p-5 gap-4",
        !enabled && "opacity-60",
        className
      )}
    >
      {/* ---- Header ---- */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600 ring-1 ring-primary-100">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">{name}</h3>
            <span className="text-xs text-surface-400 capitalize">
              {agentKey} agent
            </span>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            statusCfg.badgeClass
          )}
        >
          <span className={statusCfg.dotClass} />
          {statusCfg.label}
        </span>
      </div>

      {/* ---- Metrics row ---- */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Latency
          </span>
          <span className="text-sm font-semibold text-surface-800 mt-0.5">
            {avgResponseMs}ms
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Req/min
          </span>
          <span className="text-sm font-semibold text-surface-800 mt-0.5">
            {requestsPerMin.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Errors
          </span>
          <span
            className={clsx(
              "text-sm font-semibold mt-0.5",
              errorRate > 5
                ? "text-danger-600"
                : errorRate > 2
                  ? "text-warning-600"
                  : "text-surface-800"
            )}
          >
            {errorRate.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* ---- Mini trend ---- */}
      {trendData.length > 0 && (
        <div className="px-1">
          <MiniTrend data={trendData} />
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="flex items-center gap-2 pt-1 border-t border-surface-100">
        <button
          onClick={() => onReload?.(agentKey)}
          className="btn-ghost btn-sm flex items-center gap-1.5"
          title="Reload agent"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Reload</span>
        </button>
        <button
          onClick={() => onConfigure?.(agentKey)}
          className="btn-ghost btn-sm flex items-center gap-1.5"
          title="Configure agent"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Configure</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Activity
            className={clsx(
              "w-3.5 h-3.5",
              status === "active"
                ? "text-success-500"
                : status === "degraded"
                  ? "text-warning-500"
                  : "text-danger-500"
            )}
          />
          <span className="text-[11px] text-surface-400">
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
