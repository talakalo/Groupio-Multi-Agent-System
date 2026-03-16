"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { Clock, ChevronLeft, ChevronRight, Filter } from "lucide-react";

export type ActivityActionType = "decision" | "escalation" | "api_call" | "config_change" | "error";

export interface AgentActivityEntry {
  id: string;
  agentName: string;
  actionType: ActivityActionType;
  timestamp: string;
  status: "success" | "failure" | "pending";
  details: string;
}

interface AgentActivityLogProps {
  entries: AgentActivityEntry[];
  agentNames: string[];
  pageSize?: number;
}

const ACTION_TYPE_LABELS: Record<ActivityActionType, string> = {
  decision: "Decision",
  escalation: "Escalation",
  api_call: "API Call",
  config_change: "Config Change",
  error: "Error",
};

const STATUS_DOT: Record<AgentActivityEntry["status"], string> = {
  success: "bg-success-500",
  failure: "bg-danger-500",
  pending: "bg-warning-500",
};

export function AgentActivityLog({
  entries,
  agentNames,
  pageSize = 10,
}: AgentActivityLogProps) {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (agentFilter !== "all" && e.agentName !== agentFilter) return false;
      if (typeFilter !== "all" && e.actionType !== typeFilter) return false;
      return true;
    });
  }, [entries, agentFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePageIndex = Math.min(page, totalPages - 1);
  const pageEntries = filtered.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-surface-400" />
        <select
          className="input !w-auto !py-1.5 text-xs"
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}
        >
          <option value="all">All Agents</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          className="input !w-auto !py-1.5 text-xs"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
        >
          <option value="all">All Types</option>
          {(Object.keys(ACTION_TYPE_LABELS) as ActivityActionType[]).map((type) => (
            <option key={type} value={type}>{ACTION_TYPE_LABELS[type]}</option>
          ))}
        </select>
        <span className="text-xs text-surface-400 ms-auto">
          {filtered.length} entries
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Agent</th>
              <th className="table-header">Type</th>
              <th className="table-header">Details</th>
              <th className="table-header">Status</th>
              <th className="table-header">Time</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-sm text-surface-400 py-8">
                  No activity found
                </td>
              </tr>
            )}
            {pageEntries.map((entry) => (
              <tr key={entry.id} className="table-row">
                <td className="table-cell font-medium text-surface-900">
                  {entry.agentName}
                </td>
                <td className="table-cell">
                  <span className="badge bg-surface-100 text-surface-600">
                    {ACTION_TYPE_LABELS[entry.actionType]}
                  </span>
                </td>
                <td className="table-cell max-w-xs truncate" title={entry.details}>
                  {entry.details}
                </td>
                <td className="table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={clsx("inline-block w-2 h-2 rounded-full", STATUS_DOT[entry.status])} />
                    <span className="capitalize text-xs">{entry.status}</span>
                  </span>
                </td>
                <td className="table-cell whitespace-nowrap">
                  <span className="flex items-center gap-1 text-xs text-surface-400">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.timestamp).toLocaleTimeString("en-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePageIndex === 0}
            className="btn-ghost btn-sm inline-flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <span className="text-xs text-surface-500">
            Page {safePageIndex + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePageIndex >= totalPages - 1}
            className="btn-ghost btn-sm inline-flex items-center gap-1"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
