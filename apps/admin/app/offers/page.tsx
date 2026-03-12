"use client";

import { useState, useMemo, useCallback } from "react";
import { clsx } from "clsx";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Flag,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Users,
  DollarSign,
  Calendar,
  Tag,
  Building2,
  MoreHorizontal,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Offer {
  id: string;
  title: string;
  category: string;
  building?: string;
  status:
    | "draft"
    | "pending"
    | "matching"
    | "matched"
    | "in_progress"
    | "completed"
    | "cancelled";
  participants: number;
  price?: number;
  flagged: boolean;
  created_at: string;
}

type StatusFilter =
  | "all"
  | "draft"
  | "pending"
  | "matching"
  | "matched"
  | "in_progress"
  | "completed"
  | "cancelled";

type SortField = "title" | "category" | "status" | "participants" | "price" | "created_at";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  matching: "Matching",
  matched: "Matched",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-surface-100 text-surface-600",
  pending: "bg-warning-50 text-warning-700",
  matching: "bg-primary-50 text-primary-700",
  matched: "bg-primary-100 text-primary-800",
  in_progress: "bg-info-50 text-info-700",
  completed: "bg-success-50 text-success-700",
  cancelled: "bg-danger-50 text-danger-700",
};

const CATEGORY_OPTIONS = [
  "ac_installation",
  "ac_maintenance",
  "kitchen",
  "electrical",
  "plumbing",
  "heating",
  "renovations",
  "painting",
  "flooring",
  "windows",
];

const CATEGORY_LABELS: Record<string, string> = {
  ac_installation: "AC Installation",
  ac_maintenance: "AC Maintenance",
  kitchen: "Kitchen",
  electrical: "Electrical",
  plumbing: "Plumbing",
  heating: "Heating",
  renovations: "Renovations",
  painting: "Painting",
  flooring: "Flooring",
  windows: "Windows",
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchOpts = (): RequestInit => ({ credentials: "include", headers: { "Content-Type": "application/json" } });

async function fetchOffers(): Promise<Offer[]> {
  const res = await fetch(`${API_URL}/api/v1/admin/offers`, fetchOpts());
  if (!res.ok) throw new Error("Failed to fetch offers");
  const data = await res.json();
  return data.offers ?? data.items ?? data;
}

async function approveOffer(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/admin/offers/${id}/approve`, {
    method: "POST",
    ...fetchOpts(),
  });
  if (!res.ok) throw new Error("Failed to approve offer");
}

async function cancelOffer(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/admin/offers/${id}/cancel`, {
    method: "POST",
    ...fetchOpts(),
  });
  if (!res.ok) throw new Error("Failed to cancel offer");
}

async function flagOffer(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/admin/offers/${id}/flag`, {
    method: "POST",
    ...fetchOpts(),
  });
  if (!res.ok) throw new Error("Failed to flag offer");
}

async function downloadCsv(url: string, filename: string): Promise<void> {
  const res = await fetch(url, fetchOpts());
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function OffersPage() {
  const queryClient = useQueryClient();

  // ---- Data fetching ----
  const {
    data: offers = [],
    isLoading,
    error: fetchError,
  } = useQuery<Offer[]>({
    queryKey: ["admin", "offers"],
    queryFn: fetchOffers,
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: approveOffer,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "offers"] }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOffer,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "offers"] }),
  });

  const flagMutation = useMutation({
    mutationFn: flagOffer,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "offers"] }),
  });

  // ---- Filters ----
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ---- Action dropdown ----
  const [actionDropdownId, setActionDropdownId] = useState<string | null>(null);

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let result = offers;

    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (categoryFilter !== "all") {
      result = result.filter((o) => o.category === categoryFilter);
    }
    if (flaggedOnly) {
      result = result.filter((o) => o.flagged);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.building && o.building.toLowerCase().includes(q)) ||
          (CATEGORY_LABELS[o.category] || o.category)
            .toLowerCase()
            .includes(q)
      );
    }

    return result;
  }, [offers, statusFilter, categoryFilter, flaggedOnly, searchQuery]);

  // ---- Sorting ----
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "participants":
          cmp = a.participants - b.participants;
          break;
        case "price":
          cmp = (a.price ?? 0) - (b.price ?? 0);
          break;
        case "created_at":
          cmp =
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // ---- Stats ----
  const stats = useMemo(() => {
    const active = offers.filter(
      (o) =>
        o.status !== "draft" &&
        o.status !== "cancelled" &&
        o.status !== "completed"
    ).length;
    const flagged = offers.filter((o) => o.flagged).length;
    const completed = offers.filter((o) => o.status === "completed").length;
    return { total: offers.length, active, flagged, completed };
  }, [offers]);

  // ---- Sort toggle ----
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const isMutating =
    approveMutation.isPending ||
    cancelMutation.isPending ||
    flagMutation.isPending;

  // ---- Sort header helper ----
  function SortTh({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) {
    return (
      <th
        className="table-header cursor-pointer select-none"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          {sortField === field &&
            (sortDir === "asc" ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            ))}
        </div>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">
            Offer Management
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Review, approve, and manage group-buy offers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              downloadCsv(
                `${API_URL}/api/v1/admin/export/offers`,
                `groupio_offers_${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-300 text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Offers CSV
          </button>
          <button
            onClick={() =>
              downloadCsv(
                `${API_URL}/api/v1/admin/export/participants`,
                `groupio_participants_${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-300 text-surface-700 hover:bg-surface-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Participants CSV
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Stats                                                              */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">{stats.total}</p>
            <p className="text-xs text-surface-500">Total Offers</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success-50 text-success-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">{stats.active}</p>
            <p className="text-xs text-surface-500">Active</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-danger-50 text-danger-600">
            <Flag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">
              {stats.flagged}
            </p>
            <p className="text-xs text-surface-500">Flagged</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-100 text-surface-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-900">
              {stats.completed}
            </p>
            <p className="text-xs text-surface-500">Completed</p>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Filters                                                            */}
      {/* ================================================================== */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-surface-400" />
          <span className="text-sm font-semibold text-surface-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search by title, ID, or building..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status */}
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="matching">Matching</option>
            <option value="matched">Matched</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Category */}
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat] || cat}
              </option>
            ))}
          </select>

          {/* Flagged toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFlaggedOnly((v) => !v)}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                flaggedOnly ? "bg-danger-600" : "bg-surface-300"
              )}
              role="switch"
              aria-checked={flaggedOnly}
              aria-label="Show flagged only"
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                  flaggedOnly ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-surface-700">Flagged only</span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Offers Table                                                       */}
      {/* ================================================================== */}
      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          <span className="ml-2 text-sm text-surface-500">
            Loading offers...
          </span>
        </div>
      ) : fetchError ? (
        <div className="card p-10 flex items-center justify-center gap-2 text-danger-600">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">
            Failed to load offers. Please try again.
          </span>
        </div>
      ) : (
        <div className="table-container">
          <table className="w-full text-left">
            <thead>
              <tr>
                <SortTh field="title">Title</SortTh>
                <SortTh field="category">Category</SortTh>
                <th className="table-header">Building</th>
                <SortTh field="status">Status</SortTh>
                <SortTh field="participants">Participants</SortTh>
                <SortTh field="price">Price</SortTh>
                <SortTh field="created_at">Created</SortTh>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-cell text-center py-10">
                    <span className="text-surface-400">
                      No offers match the current filters
                    </span>
                  </td>
                </tr>
              )}
              {sorted.map((offer) => (
                <tr
                  key={offer.id}
                  className={clsx(
                    "table-row",
                    offer.flagged &&
                      "border-l-4 border-l-danger-500 bg-danger-50/30"
                  )}
                >
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      {offer.flagged && (
                        <Flag className="w-4 h-4 text-danger-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-surface-900">
                          {offer.title}
                        </p>
                        <p className="text-xs text-surface-400 font-mono">
                          {offer.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-surface-100 text-surface-600">
                      <Tag className="w-3 h-3" />
                      {CATEGORY_LABELS[offer.category] || offer.category}
                    </span>
                  </td>
                  <td className="table-cell">
                    {offer.building ? (
                      <span className="inline-flex items-center gap-1 text-surface-600">
                        <Building2 className="w-3.5 h-3.5 text-surface-400" />
                        {offer.building}
                      </span>
                    ) : (
                      <span className="text-surface-400">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span
                      className={clsx(
                        "badge",
                        STATUS_BADGE_CLASSES[offer.status] || "badge-normal"
                      )}
                    >
                      {STATUS_LABELS[offer.status] || offer.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center gap-1 text-surface-700">
                      <Users className="w-3.5 h-3.5 text-surface-400" />
                      {offer.participants}
                    </span>
                  </td>
                  <td className="table-cell">
                    {offer.price != null ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-surface-700">
                        <DollarSign className="w-3.5 h-3.5 text-surface-400" />
                        {offer.price.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-surface-400">—</span>
                    )}
                  </td>
                  <td className="table-cell text-surface-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-surface-400" />
                      {new Date(offer.created_at).toLocaleDateString("en-IL", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="relative">
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() =>
                          setActionDropdownId(
                            actionDropdownId === offer.id ? null : offer.id
                          )
                        }
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {actionDropdownId === offer.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-lg shadow-lg border border-surface-200 py-1">
                          {/* Approve (for flagged) */}
                          {offer.flagged && (
                            <button
                              className="w-full text-left px-3 py-2 text-xs text-success-700 hover:bg-success-50 transition-colors flex items-center gap-2"
                              onClick={() => {
                                approveMutation.mutate(offer.id);
                                setActionDropdownId(null);
                              }}
                              disabled={isMutating}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}
                          {/* Cancel */}
                          {offer.status !== "cancelled" &&
                            offer.status !== "completed" && (
                              <button
                                className="w-full text-left px-3 py-2 text-xs text-danger-700 hover:bg-danger-50 transition-colors flex items-center gap-2"
                                onClick={() => {
                                  cancelMutation.mutate(offer.id);
                                  setActionDropdownId(null);
                                }}
                                disabled={isMutating}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancel Offer
                              </button>
                            )}
                          {/* Flag */}
                          {!offer.flagged && (
                            <button
                              className="w-full text-left px-3 py-2 text-xs text-warning-700 hover:bg-warning-50 transition-colors flex items-center gap-2"
                              onClick={() => {
                                flagMutation.mutate(offer.id);
                                setActionDropdownId(null);
                              }}
                              disabled={isMutating}
                            >
                              <Flag className="w-3.5 h-3.5" />
                              Flag for Review
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
