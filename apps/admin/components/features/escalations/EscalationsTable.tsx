"use client";

import type { Escalation } from "@groupio/types";
import { clsx } from "clsx";

import {
  getEscalationActionsTaken,
  getEscalationIntent,
  getEscalationRagSummary,
} from "@/lib/escalation-context";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
  UserPlus,
  ArrowUpRight,
  Clock,
  Bot,
} from "lucide-react";
import { Fragment, useState, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = "id" | "priority" | "status" | "createdAt";
type SortDir = "asc" | "desc";

export interface EscalationsTableProps {
  /** The array of escalation records to display */
  escalations: Escalation[];
  /** Rows per page */
  pageSize?: number;
  /** Called when the resolve action is triggered */
  onResolve?: (id: string) => void;
  /** Called when the reassign action is triggered */
  onReassign?: (id: string) => void;
  /** Called when the escalate-further action is triggered */
  onEscalate?: (id: string) => void;
  /** Called when selected IDs change (for bulk actions) */
  onSelectionChange?: (ids: string[]) => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "badge badge-urgent",
  high: "badge badge-high",
  normal: "badge badge-normal",
  low: "badge badge-low",
};

const STATUS_BADGE: Record<string, string> = {
  open: "badge badge-open",
  assigned: "badge badge-assigned",
  in_progress: "badge badge-assigned",
  waiting_customer: "badge badge-assigned",
  resolved: "badge badge-resolved",
  closed: "badge badge-resolved",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "In progress",
  in_progress: "In progress",
  waiting_customer: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

function displayEscalationStatus(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getSourceAgent(esc: Escalation): string {
  const actions = getEscalationActionsTaken(esc.context);
  if (actions.length > 0) return actions[0].agent;
  const fromApi = (esc as Escalation & { sourceAgent?: string }).sourceAgent;
  if (fromApi) return fromApi;
  return "unknown";
}

// ---------------------------------------------------------------------------
// SortHeader Component (defined outside to avoid recreating on each render)
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  field: SortField;
  children: React.ReactNode;
  currentSortField: SortField;
  currentSortDir: SortDir;
  onSort: (field: SortField) => void;
}

function SortHeader({
  field,
  children,
  currentSortField,
  currentSortDir,
  onSort,
}: SortHeaderProps) {
  return (
    <th
      className="table-header cursor-pointer select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {currentSortField === field &&
          (currentSortDir === "asc" ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          ))}
      </div>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EscalationsTable({
  escalations,
  pageSize = 10,
  onResolve,
  onReassign,
  onEscalate,
  onSelectionChange,
  className,
}: EscalationsTableProps) {
  // ---- Sort state ----
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ---- Pagination ----
  const [page, setPage] = useState(0);

  // ---- Selection ----
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ---- Expanded rows ----
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ---- Sort logic ----
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortField]
  );

  // ---- Sorted + paginated data ----
  const sorted = useMemo(() => {
    const copy = [...escalations];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "id":
          cmp = a.id.localeCompare(b.id);
          break;
        case "priority":
          cmp =
            (PRIORITY_ORDER[a.priority] ?? 99) -
            (PRIORITY_ORDER[b.priority] ?? 99);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "createdAt":
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [escalations, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize);

  // ---- Selection helpers ----
  const allOnPageSelected =
    pageData.length > 0 && pageData.every((e) => selected.has(e.id));

  const toggleSelectAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageData.forEach((e) => next.delete(e.id));
    } else {
      pageData.forEach((e) => next.add(e.id));
    }
    setSelected(next);
    onSelectionChange?.(Array.from(next));
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
    onSelectionChange?.(Array.from(next));
  };

  return (
    <div className={clsx("table-container", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              {/* Checkbox */}
              <th className="table-header w-10">
                <input
                  type="checkbox"
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <SortHeader field="id" currentSortField={sortField} currentSortDir={sortDir} onSort={toggleSort}>ID</SortHeader>
              <SortHeader field="priority" currentSortField={sortField} currentSortDir={sortDir} onSort={toggleSort}>Priority</SortHeader>
              <th className="table-header">Source Agent</th>
              <th className="table-header">Reason</th>
              <SortHeader field="createdAt" currentSortField={sortField} currentSortDir={sortDir} onSort={toggleSort}>Created</SortHeader>
              <SortHeader field="status" currentSortField={sortField} currentSortDir={sortDir} onSort={toggleSort}>Status</SortHeader>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="table-cell text-center py-10 text-surface-400"
                >
                  No escalations found
                </td>
              </tr>
            )}
            {pageData.map((esc) => {
              const isExpanded = expandedId === esc.id;
              const actionsTaken = getEscalationActionsTaken(esc.context);
              const ragSummary = getEscalationRagSummary(esc.context);
              return (
                <Fragment key={esc.id}>
                  <tr
                    className={clsx(
                      "table-row cursor-pointer",
                      isExpanded && "bg-surface-50"
                    )}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : esc.id)
                    }
                  >
                    {/* Checkbox */}
                    <td
                      className="table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                        checked={selected.has(esc.id)}
                        onChange={() => toggleSelectOne(esc.id)}
                      />
                    </td>
                    {/* ID */}
                    <td className="table-cell font-mono text-xs">
                      {esc.id}
                    </td>
                    {/* Priority */}
                    <td className="table-cell">
                      <span className={PRIORITY_BADGE[esc.priority] ?? "badge"}>
                        {esc.priority}
                      </span>
                    </td>
                    {/* Source Agent */}
                    <td className="table-cell capitalize">
                      <span className="inline-flex items-center gap-1">
                        <Bot className="w-3.5 h-3.5 text-surface-400" />
                        {getSourceAgent(esc)}
                      </span>
                    </td>
                    {/* Reason */}
                    <td className="table-cell max-w-xs truncate">
                      {esc.reason}
                    </td>
                    {/* Created */}
                    <td className="table-cell">
                      <span className="inline-flex items-center gap-1 text-surface-500">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelativeTime(esc.createdAt)}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="table-cell">
                      <span
                        className={
                          STATUS_BADGE[esc.status] ?? "badge badge-low"
                        }
                      >
                        {displayEscalationStatus(esc.status)}
                      </span>
                    </td>
                    {/* Actions */}
                    <td
                      className="table-cell"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        {esc.status !== "resolved" && (
                          <>
                            <button
                              className="btn-ghost btn-sm"
                              title="Resolve"
                              onClick={() => onResolve?.(esc.id)}
                            >
                              <Check className="w-3.5 h-3.5 text-success-600" />
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              title="Reassign"
                              onClick={() => onReassign?.(esc.id)}
                            >
                              <UserPlus className="w-3.5 h-3.5 text-primary-600" />
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              title="Escalate further"
                              onClick={() => onEscalate?.(esc.id)}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 text-warning-600" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <tr className="bg-surface-50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Conversation & context */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                              Escalation Context
                            </h4>
                            <dl className="space-y-2 text-sm">
                              <div className="flex gap-2">
                                <dt className="text-surface-400 min-w-[100px]">
                                  User ID:
                                </dt>
                                <dd className="font-mono text-surface-700">
                                  {esc.userId}
                                </dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-surface-400 min-w-[100px]">
                                  Conversation:
                                </dt>
                                <dd className="font-mono text-surface-700">
                                  {esc.conversationId}
                                </dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-surface-400 min-w-[100px]">
                                  Intent:
                                </dt>
                                <dd className="text-surface-700">
                                  {getEscalationIntent(esc.context) || "—"}
                                </dd>
                              </div>
                              {ragSummary && (
                                <div className="flex gap-2">
                                  <dt className="text-surface-400 min-w-[100px]">
                                    RAG Summary:
                                  </dt>
                                  <dd className="text-surface-700">
                                    {ragSummary}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>

                          {/* Agent reasoning / actions taken */}
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                              Agent Actions Taken
                            </h4>
                            <ol className="space-y-1.5">
                              {actionsTaken.length === 0 ? (
                                <li className="text-sm text-surface-500">
                                  No actions recorded
                                </li>
                              ) : (
                                actionsTaken.map((action, idx) => (
                                  <li
                                    key={idx}
                                    className="flex items-start gap-2 text-sm"
                                  >
                                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <span className="font-medium text-surface-700 capitalize">
                                        {action.agent}
                                      </span>
                                      <span className="text-surface-400 mx-1">
                                        &mdash;
                                      </span>
                                      <span className="text-surface-600">
                                        {action.action}
                                      </span>
                                    </div>
                                  </li>
                                ))
                              )}
                            </ol>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Pagination ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100">
        <p className="text-xs text-surface-500">
          {selected.size > 0 && (
            <span className="font-medium text-primary-600 mr-2">
              {selected.size} selected
            </span>
          )}
          Showing {page * pageSize + 1}&ndash;
          {Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage(0)}
            aria-label="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            className="btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-surface-600 px-2">
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn-ghost btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="btn-ghost btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            aria-label="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

