"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  Filter,
  Search,
  Download,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { EscalationsTable } from "@/components/features/escalations/EscalationsTable";
import { MetricCard } from "@/components/features/metrics/MetricCard";
import {
  getEscalationActionsTaken,
  getEscalationIntent,
} from "@/lib/escalation-context";
import { useEscalations, useResolveEscalation } from "@/lib/hooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PriorityFilter = "all" | "urgent" | "high" | "normal" | "low";
type StatusFilter = "all" | "open" | "assigned" | "resolved";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const API_BASE_V1 = API_BASE.endsWith("/api/v1") ? API_BASE : `${API_BASE}/api/v1`;

const PRIORITY_ESCALATION_MAP: Record<string, string> = {
  low: "normal",
  normal: "high",
  high: "urgent",
  urgent: "urgent",
  /** If list data ever bypasses UI normalization */
  medium: "high",
  critical: "urgent",
};

/** UI priority → FastAPI ``EscalationPriority`` (medium/high/critical, not "urgent"). */
function priorityUiToApi(p: string): string {
  const m: Record<string, string> = {
    low: "low",
    normal: "medium",
    high: "high",
    urgent: "critical",
  };
  return m[p] ?? p;
}

async function adminJsonRequest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_V1}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Request failed with ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function EscalationsPage() {
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryClient = useQueryClient();

  const { data: escalationsData, isLoading } = useEscalations({
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const resolveMutation = useResolveEscalation();

  const allEscalations = useMemo(
    () => escalationsData?.escalations ?? [],
    [escalationsData?.escalations]
  );

  // ---- Client-side filtering ----
  const filteredEscalations = useMemo(() => {
    let result = allEscalations;

    // Priority filter
    if (priorityFilter !== "all") {
      result = result.filter((e) => e.priority === priorityFilter);
    }

    // Status filter (API may still send in_progress; normalized client uses assigned)
    if (statusFilter !== "all") {
      if (statusFilter === "assigned") {
        result = result.filter((e) => {
          const s = e.status as string;
          return s === "assigned" || s === "in_progress";
        });
      } else {
        result = result.filter((e) => e.status === statusFilter);
      }
    }

    // Agent source filter
    if (agentFilter !== "all") {
      result = result.filter((e) => {
        const actions = getEscalationActionsTaken(e.context);
        const fromAction = actions.length > 0 ? actions[0].agent : "";
        const fromApi = (e as { sourceAgent?: string }).sourceAgent ?? "";
        const sourceAgent = fromAction || fromApi;
        return sourceAgent === agentFilter;
      });
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.reason.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          getEscalationIntent(e.context).toLowerCase().includes(q)
      );
    }

    // Date range
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      result = result.filter(
        (e) => new Date(e.createdAt).getTime() >= fromTs
      );
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime() + 86_400_000; // end of day
      result = result.filter(
        (e) => new Date(e.createdAt).getTime() <= toTs
      );
    }

    return result;
  }, [
    allEscalations,
    priorityFilter,
    statusFilter,
    agentFilter,
    searchQuery,
    dateFrom,
    dateTo,
  ]);

  // ---- Statistics ----
  const stats = useMemo(() => {
    const open = allEscalations.filter((e) => e.status === "open").length;
    const assigned = allEscalations.filter((e) => {
      const s = e.status as string;
      return s === "assigned" || s === "in_progress";
    }).length;
    const resolved = allEscalations.filter(
      (e) => e.status === "resolved"
    ).length;
    const urgent = allEscalations.filter(
      (e) => e.priority === "urgent" && e.status !== "resolved"
    ).length;
    return { open, assigned, resolved, urgent, total: allEscalations.length };
  }, [allEscalations]);

  // ---- Unique agent sources for filter dropdown ----
  const agentSources = useMemo(() => {
    const sources = new Set<string>();
    allEscalations.forEach((e) => {
      const actions = getEscalationActionsTaken(e.context);
      if (actions.length > 0) sources.add(actions[0].agent);
      else {
        const sa = (e as { sourceAgent?: string }).sourceAgent;
        if (sa) sources.add(sa);
      }
    });
    return Array.from(sources).sort();
  }, [allEscalations]);

  // ---- Action handlers ----
  const handleResolve = useCallback(
    (id: string) => {
      resolveMutation.mutate({ escalationId: id });
    },
    [resolveMutation]
  );

  const handleReassign = useCallback(
    async (id: string) => {
      try {
        // Use the current admin user id from localStorage (or fallback to "admin")
        const raw =
          typeof window !== "undefined"
            ? localStorage.getItem("admin_user_id")
            : null;
        const adminUserId = raw?.trim() || "admin";

        await adminJsonRequest(`/escalations/${encodeURIComponent(id)}/assign`, {
          method: "POST",
          body: JSON.stringify({ assigned_to: adminUserId }),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "escalations"] });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to reassign escalation");
      }
    },
    [queryClient]
  );

  const handleEscalate = useCallback(
    async (id: string) => {
      try {
        // Find the current escalation to determine its priority
        const escalation = allEscalations.find((e) => e.id === id);
        const currentPriority = escalation?.priority ?? "normal";
        const newPriority = PRIORITY_ESCALATION_MAP[currentPriority] ?? "urgent";

        if (currentPriority === "urgent") {
          alert("This escalation is already at the highest priority level (urgent).");
          return;
        }

        const apiPriority = priorityUiToApi(newPriority);
        if (!apiPriority) {
          throw new Error("Invalid priority mapping");
        }
        await adminJsonRequest(`/escalations/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ priority: apiPriority }),
        });
        await queryClient.invalidateQueries({ queryKey: ["admin", "escalations"] });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to escalate further");
      }
    },
    [allEscalations, queryClient]
  );

  const handleExport = useCallback(() => {
    const headers = [
      "ID",
      "Priority",
      "Status",
      "Reason",
      "Source Agent",
      "Created At",
    ];
    const rows = filteredEscalations.map((e) => [
      e.id,
      e.priority,
      e.status,
      `"${e.reason.replace(/"/g, '""')}"`,
      getEscalationActionsTaken(e.context)[0]?.agent ?? "",
      e.createdAt,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escalations-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEscalations]);

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">
            Escalation Queue
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Review and manage agent escalations requiring human attention
          </p>
        </div>
        <button className="btn-secondary" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* ================================================================== */}
      {/* Statistics Bar                                                      */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Open"
          value={String(stats.open)}
          variant="warning"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <MetricCard
          label="In Progress"
          value={String(stats.assigned)}
          variant="primary"
          icon={<Loader2 className="w-4 h-4" />}
        />
        <MetricCard
          label="Resolved Today"
          value={String(stats.resolved)}
          variant="success"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          label="Urgent"
          value={String(stats.urgent)}
          variant="danger"
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      {/* SLA Indicators */}
      {stats.urgent > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200">
          <Clock className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger-700">
              SLA Alert: {stats.urgent} urgent escalation{stats.urgent > 1 ? "s" : ""} pending
            </p>
            <p className="text-xs text-danger-600 mt-0.5">
              Urgent escalations require resolution within 2 hours. Open escalations beyond SLA are highlighted.
            </p>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Filters                                                             */}
      {/* ================================================================== */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-surface-400" />
          <span className="text-sm font-semibold text-surface-700">
            Filters
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search by ID, reason, or intent..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Priority */}
          <select
            className="input"
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(e.target.value as PriorityFilter)
            }
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>

          {/* Status */}
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Agent source */}
          <select
            className="input"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="all">All Agents</option>
            {agentSources.map((src) => (
              <option key={src} value={src}>
                {src.charAt(0).toUpperCase() + src.slice(1)}
              </option>
            ))}
          </select>

          {/* Date range - from */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
            />
          </div>
        </div>

        {/* Active filter badges */}
        {(priorityFilter !== "all" ||
          statusFilter !== "all" ||
          agentFilter !== "all" ||
          searchQuery.trim()) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-surface-400">Active filters:</span>
            {priorityFilter !== "all" && (
              <button
                className="badge badge-normal cursor-pointer hover:opacity-80"
                onClick={() => setPriorityFilter("all")}
              >
                Priority: {priorityFilter} &times;
              </button>
            )}
            {statusFilter !== "all" && (
              <button
                className="badge badge-normal cursor-pointer hover:opacity-80"
                onClick={() => setStatusFilter("all")}
              >
                Status: {statusFilter} &times;
              </button>
            )}
            {agentFilter !== "all" && (
              <button
                className="badge badge-normal cursor-pointer hover:opacity-80"
                onClick={() => setAgentFilter("all")}
              >
                Agent: {agentFilter} &times;
              </button>
            )}
            {searchQuery.trim() && (
              <button
                className="badge badge-normal cursor-pointer hover:opacity-80"
                onClick={() => setSearchQuery("")}
              >
                Search: &ldquo;{searchQuery}&rdquo; &times;
              </button>
            )}
            <button
              className="text-xs text-primary-600 hover:underline ml-2"
              onClick={() => {
                setPriorityFilter("all");
                setStatusFilter("all");
                setAgentFilter("all");
                setSearchQuery("");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Escalations Table                                                   */}
      {/* ================================================================== */}
      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          <span className="ml-2 text-sm text-surface-500">
            Loading escalations...
          </span>
        </div>
      ) : (
        <EscalationsTable
          escalations={filteredEscalations}
          pageSize={10}
          onResolve={handleResolve}
          onReassign={handleReassign}
          onEscalate={handleEscalate}
        />
      )}
    </div>
  );
}
