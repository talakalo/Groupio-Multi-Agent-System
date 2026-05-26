"use client";

import { clsx } from "clsx";
import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricType = "calls" | "avgLatencyMs" | "errorRate";

export interface AgentDataPoint {
  /** ISO timestamp or label for the x-axis */
  timestamp: string;
  /** Number of calls in this time bucket */
  calls: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Error rate percentage (0-100) */
  errorRate?: number;
}

export interface AgentChartSeries {
  /** Agent identifier */
  agentKey: string;
  /** Human-readable agent name */
  label: string;
  /** Color used for this agent's series */
  color: string;
  /** Array of data points ordered by time */
  data: AgentDataPoint[];
}

export interface AgentMetricsChartProps {
  /** One or more agent series to render */
  series: AgentChartSeries[];
  /** Whether to enable comparison mode (overlay multiple agents) */
  comparisonMode?: boolean;
  /** Chart height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_OPTIONS: { value: MetricType; label: string; unit: string }[] = [
  { value: "calls", label: "Calls", unit: "" },
  { value: "avgLatencyMs", label: "Avg Latency", unit: "ms" },
  { value: "errorRate", label: "Error Rate", unit: "%" },
];

const AGENT_COLORS = [
  "#1a9a76", // primary (brand green)
  "#22c55e", // success (green)
  "#f59e0b", // warning (amber)
  "#ef4444", // danger (red)
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#ec4899", // pink
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-IL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentMetricsChart({
  series,
  comparisonMode = false,
  height = 320,
  className,
}: AgentMetricsChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("calls");

  // Merge data points from multiple series into a single unified dataset
  // keyed by timestamp. Each agent gets its own column.
  const chartData = useMemo(() => {
    if (series.length === 0) return [];

    if (!comparisonMode || series.length === 1) {
      // Single agent mode: use data directly
      const s = series[0];
      return s.data.map((d) => ({
        time: formatTimestamp(d.timestamp),
        calls: d.calls,
        avgLatencyMs: d.avgLatencyMs,
        errorRate: d.errorRate ?? 0,
      }));
    }

    // Comparison mode: merge by timestamp index
    const maxLen = Math.max(...series.map((s) => s.data.length));
    const merged: Record<string, unknown>[] = [];

    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, unknown> = {
        time: formatTimestamp(
          series[0].data[i]?.timestamp ?? `Point ${i + 1}`
        ),
      };
      for (const s of series) {
        const pt = s.data[i];
        if (pt) {
          row[`${s.agentKey}_calls`] = pt.calls;
          row[`${s.agentKey}_avgLatencyMs`] = pt.avgLatencyMs;
          row[`${s.agentKey}_errorRate`] = pt.errorRate ?? 0;
        }
      }
      merged.push(row);
    }
    return merged;
  }, [series, comparisonMode]);

  const currentMetricInfo =
    METRIC_OPTIONS.find((m) => m.value === selectedMetric) ??
    METRIC_OPTIONS[0];

  return (
    <div className={clsx("card p-5", className)}>
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-surface-900">
            Agent Performance
          </h3>
          <p className="text-xs text-surface-400 mt-0.5">
            {comparisonMode && series.length > 1
              ? `Comparing ${series.length} agents`
              : series[0]?.label ?? "No data"}
            {currentMetricInfo.unit && ` (${currentMetricInfo.unit})`}
          </p>
        </div>

        {/* Metric selector tabs */}
        <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedMetric(opt.value)}
              className={clsx(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150",
                selectedMetric === opt.value
                  ? "bg-white text-surface-900 shadow-sm"
                  : "text-surface-500 hover:text-surface-700"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Chart ---- */}
      {chartData.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-surface-400"
          style={{ height }}
        >
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "0.5rem",
                fontSize: "0.75rem",
                boxShadow:
                  "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
              }}
            />
            {comparisonMode && series.length > 1 && (
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }}
              />
            )}

            {/* Render series */}
            {!comparisonMode || series.length === 1 ? (
              <>
                {selectedMetric === "calls" && (
                  <Bar
                    dataKey="calls"
                    fill="#4f46e5"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                    name="Calls"
                  />
                )}
                {selectedMetric === "avgLatencyMs" && (
                  <Line
                    type="monotone"
                    dataKey="avgLatencyMs"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="Avg Latency (ms)"
                  />
                )}
                {selectedMetric === "errorRate" && (
                  <Line
                    type="monotone"
                    dataKey="errorRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="Error Rate (%)"
                  />
                )}
              </>
            ) : (
              series.map((s, idx) => {
                const color = s.color || AGENT_COLORS[idx % AGENT_COLORS.length];
                const key = `${s.agentKey}_${selectedMetric}`;

                if (selectedMetric === "calls") {
                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      fill={color}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={18}
                      name={s.label}
                    />
                  );
                }
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name={s.label}
                  />
                );
              })
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
