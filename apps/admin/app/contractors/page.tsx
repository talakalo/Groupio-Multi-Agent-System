"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Star,
  Mail,
  Phone,
  MapPin,
  Tag,
  ShieldCheck,
  ShieldOff,
  FileText,
  MoreHorizontal,
  Download,
  X,
  RefreshCw,
  Globe,
  UserCheck,
} from "lucide-react";
import React, { useState, useMemo, useCallback } from "react";

import { MetricCard } from "@/components/features/metrics/MetricCard";
import { useContractors } from "@/lib/hooks";
import type { ContractorListItem } from "@/lib/hooks";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const REGION_LABELS: Record<string, string> = {
  center: "Center",
  tel_aviv: "Tel Aviv",
  jerusalem: "Jerusalem",
  haifa: "Haifa",
  north: "North",
  south: "South",
  sharon: "Sharon",
  shfela: "Shfela",
};

type VerificationFilter = "all" | "verified" | "pending" | "suspended";
type SortField = "businessName" | "rating" | "verified";
type SortDir = "asc" | "desc";

// ---- Sort header helper (declared outside render) ----
function SortTh({
  field,
  sortField,
  sortDir,
  toggleSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (f: SortField) => void;
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

// Simulated trust score breakdown
interface TrustScoreBreakdown {
  licenseVerification: number;
  customerReviews: number;
  responseTime: number;
  completionRate: number;
  yearsInBusiness: number;
  overallScore: number;
}

function getTrustScore(contractor: ContractorListItem): TrustScoreBreakdown {
  // Deterministic simulation based on rating and verification
  const base = contractor.rating * 18;
  return {
    licenseVerification: contractor.verified ? 95 : 40,
    customerReviews: Math.round(base + 5),
    responseTime: Math.round(70 + contractor.rating * 5),
    completionRate: Math.round(80 + contractor.rating * 3),
    yearsInBusiness: Math.round(50 + contractor.rating * 8),
    overallScore: contractor.verified
      ? Math.round(base + 10)
      : Math.round(base - 15),
  };
}

// ---------------------------------------------------------------------------
// Trust Score Visualization
// ---------------------------------------------------------------------------

function TrustScoreBar({
  label,
  value,
  maxValue = 100,
}: {
  label: string;
  value: number;
  maxValue?: number;
}) {
  const pct = Math.min(100, (value / maxValue) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-500 w-32 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-300",
            pct >= 80
              ? "bg-success-500"
              : pct >= 60
                ? "bg-warning-500"
                : "bg-danger-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-surface-700 w-8 text-right">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verification types & helpers (Phase 3)
// ---------------------------------------------------------------------------

interface VerificationMetadataItem {
  id: string;
  contractor_id?: string;
  source: string;
  verified: boolean;
  confidence: number;
  verified_at: string;
  raw_response?: Record<string, unknown>;
  created_at?: string;
}

const EXTERNAL_SOURCE_PREFIXES = ["data_gov", "datagov", "data.gov"];

function isExternalSource(source: string): boolean {
  return EXTERNAL_SOURCE_PREFIXES.some((p) => source.toLowerCase().includes(p));
}

function sourceLabel(source: string): string {
  if (source === "data_gov_il_companies") return "data.gov.il — Company Registry";
  if (source.startsWith("datagov-")) return "data.gov.il (legacy)";
  return source;
}

// ---------------------------------------------------------------------------
// VerificationBadge
// ---------------------------------------------------------------------------

function VerificationBadge({
  verified,
  confidence,
  source,
}: {
  verified: boolean;
  confidence: number;
  source: string;
}) {
  const pct = Math.round(confidence * 100);
  const external = isExternalSource(source);

  if (verified) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 text-success-700 border border-success-200"
        title={`${sourceLabel(source)} — ${pct}% confidence`}
      >
        {external ? (
          <Globe className="w-3 h-3" />
        ) : (
          <UserCheck className="w-3 h-3" />
        )}
        {external ? "Gov Verified" : "Admin Verified"}
        <span className="text-success-500 font-normal">{pct}%</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-100 text-surface-600 border border-surface-200"
      title={`${sourceLabel(source)} — ${pct}% confidence`}
    >
      {external ? (
        <Globe className="w-3 h-3" />
      ) : (
        <UserCheck className="w-3 h-3" />
      )}
      {external ? "Gov: Not Found" : "Admin: Unverified"}
      <span className="text-surface-400 font-normal">{pct}%</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// ExternalSourcesList — rows from data.gov.il
// ---------------------------------------------------------------------------

function ExternalSourcesList({ items }: { items: VerificationMetadataItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-surface-500 italic">
        No gov-data records yet. Use &ldquo;Refresh Gov Verification&rdquo; below to look up the
        business in the ICA company registry.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div
          key={m.id}
          className="p-3 rounded-lg border border-surface-200 bg-surface-50 text-sm"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <VerificationBadge
              verified={m.verified}
              confidence={m.confidence}
              source={m.source}
            />
            <span className="text-xs text-surface-400">
              {new Date(m.verified_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-surface-500 mt-1">{sourceLabel(m.source)}</p>
          {m.raw_response && (
            <details className="mt-1">
              <summary className="text-xs text-surface-400 cursor-pointer select-none">
                Raw response
              </summary>
              <pre className="mt-1 text-[10px] text-surface-500 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(m.raw_response, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InternalReviewList — rows set by admin decisions
// ---------------------------------------------------------------------------

function InternalReviewList({ items }: { items: VerificationMetadataItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-surface-500 italic">
        No internal review records. Use Approve / Suspend actions above.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div
          key={m.id}
          className="p-3 rounded-lg border border-surface-200 bg-surface-50 text-sm"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <VerificationBadge
              verified={m.verified}
              confidence={m.confidence}
              source={m.source}
            />
            <span className="text-xs text-surface-400">
              {new Date(m.verified_at).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-surface-500 mt-1">{m.source}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VerificationProvenanceSection (replaces old VerificationMetadataSection)
// ---------------------------------------------------------------------------

function VerificationProvenanceSection({ contractorId }: { contractorId: string }) {
  const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
  const API_BASE = rawApiUrl.endsWith("/api/v1") ? rawApiUrl : `${rawApiUrl}/api/v1`;

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshMsg, setRefreshMsg] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "contractors", contractorId, "verification-metadata"],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/admin/contractors/${encodeURIComponent(contractorId)}/verification-metadata`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch verification metadata");
      return res.json() as Promise<{ items: VerificationMetadataItem[] }>;
    },
    enabled: !!contractorId,
  });

  const items = data?.items ?? [];
  const externalItems = items.filter((m) => isExternalSource(m.source));
  const internalItems = items.filter((m) => !isExternalSource(m.source));

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch(
        `${API_BASE}/admin/contractors/${encodeURIComponent(contractorId)}/refresh-verification`,
        { method: "POST", credentials: "include" }
      );
      const body = await res.json();
      await queryClient.invalidateQueries({
        queryKey: ["admin", "contractors", contractorId, "verification-metadata"],
      });
      if (body.found) {
        setRefreshMsg(
          `Found in gov registry — ${body.verified ? "active" : "inactive"} (${Math.round((body.confidence ?? 0) * 100)}% confidence)`
        );
      } else {
        setRefreshMsg(body.error ?? "Not found in gov registry");
      }
    } catch {
      setRefreshMsg("Refresh failed. Check backend logs.");
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-surface-400">Loading verification data...</p>;
  }

  return (
    <div className="space-y-4">
      {/* External (gov-data) sources */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            Gov Data Sources
          </h3>
          <button
            type="button"
            className="btn-ghost btn-sm text-xs"
            disabled={refreshing}
            onClick={handleRefresh}
            title="Re-run data.gov.il lookup and persist result"
          >
            <RefreshCw className={clsx("w-3 h-3", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh Gov"}
          </button>
        </div>
        <ExternalSourcesList items={externalItems} />
        {refreshMsg && (
          <p className="text-xs text-surface-500 italic">{refreshMsg}</p>
        )}
      </div>

      {/* Internal (admin decision) sources */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5" />
          Internal Review Records
        </h3>
        <InternalReviewList items={internalItems} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ContractorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [verificationFilter, setVerificationFilter] =
    useState<VerificationFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailContractor, setDetailContractor] =
    useState<ContractorListItem | null>(null);

  const queryClient = useQueryClient();
  const {
    data: contractors = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useContractors();
  const [actionLoading, setActionLoading] = useState(false);

  // ---- API helpers ----
  const rawApiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "http://localhost:8000";
  const API_BASE = rawApiUrl.endsWith("/api/v1") ? rawApiUrl : `${rawApiUrl}/api/v1`;

  const fetchOpts = (): RequestInit => ({
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  async function approveContractor(id: string) {
    const res = await fetch(`${API_BASE}/contractors/${encodeURIComponent(id)}/verify`, {
      method: "POST",
      ...fetchOpts(),
      body: JSON.stringify({ decision: "approved" }),
    });
    if (!res.ok) throw new Error(`Failed to approve contractor ${id}: ${res.status}`);
    return res.json();
  }

  async function suspendContractor(id: string) {
    const res = await fetch(`${API_BASE}/contractors/${encodeURIComponent(id)}`, {
      method: "PUT",
      ...fetchOpts(),
      body: JSON.stringify({ verification_status: "suspended" }),
    });
    if (!res.ok) throw new Error(`Failed to suspend contractor ${id}: ${res.status}`);
    return res.json();
  }

  async function requestDocuments(id: string) {
    const res = await fetch(`${API_BASE}/admin/contractors/${encodeURIComponent(id)}/request-docs`, {
      method: "POST",
      ...fetchOpts(),
      body: JSON.stringify({ message: "Please upload additional documents to complete your verification." }),
    });
    if (!res.ok) throw new Error(`Failed to request documents: ${res.status}`);
    return res.json();
  }

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let result = contractors;

    // Verification filter
    if (verificationFilter === "verified") {
      result = result.filter((c) => c.verified);
    } else if (verificationFilter === "pending") {
      result = result.filter((c) => !c.verified);
    }

    // Category filter
    if (categoryFilter !== "all") {
      result = result.filter((c) => c.categories.includes(categoryFilter));
    }

    // Region filter
    if (regionFilter !== "all") {
      result = result.filter((c) => c.regions.includes(regionFilter));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.businessName.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.categories.some((cat) =>
            CATEGORY_LABELS[cat]?.toLowerCase().includes(q)
          )
      );
    }

    return result;
  }, [
    contractors,
    verificationFilter,
    categoryFilter,
    regionFilter,
    searchQuery,
  ]);

  // ---- Sorting ----
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "businessName":
          cmp = a.businessName.localeCompare(b.businessName);
          break;
        case "rating":
          cmp = a.rating - b.rating;
          break;
        case "verified":
          cmp = Number(a.verified) - Number(b.verified);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // ---- Stats ----
  const stats = useMemo(() => {
    const verified = contractors.filter((c) => c.verified).length;
    const pending = contractors.filter((c) => !c.verified).length;
    const avgRating =
      contractors.length > 0
        ? contractors.reduce((sum, c) => sum + c.rating, 0) /
          contractors.length
        : 0;
    return {
      total: contractors.length,
      verified,
      pending,
      avgRating: avgRating.toFixed(1),
    };
  }, [contractors]);

  // ---- Sort toggle ----
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  // ---- Selection ----
  const allSelected =
    sorted.length > 0 && sorted.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ---- Bulk actions ----
  const handleBulkApprove = async () => {
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.allSettled(ids.map((id) => approveContractor(id)));
      await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
      setSelectedIds(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve contractors");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkSuspend = async () => {
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      await Promise.allSettled(ids.map((id) => suspendContractor(id)));
      await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
      setSelectedIds(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to suspend contractors");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkRequestDocs = async () => {
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`${API_BASE}/admin/contractors/${encodeURIComponent(id)}/request-docs`, {
            method: "POST",
            ...fetchOpts(),
            body: JSON.stringify({ message: "Please upload your license, insurance, and business registration documents to complete your verification." }),
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
      setSelectedIds(new Set());
      alert(`Document requests sent to ${succeeded} of ${ids.length} contractors.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send document requests");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">
            Contractor Management
          </h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Manage verified contractors, trust scores, and certifications
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => {
            // Export contractors to CSV
            const headers = [
              "ID",
              "Business Name",
              "Verified",
              "Rating",
              "Categories",
              "Regions",
            ];
            const rows = sorted.map((c) => [
              c.id,
              `"${c.businessName}"`,
              c.verified ? "Yes" : "No",
              c.rating,
              `"${c.categories.join(", ")}"`,
              `"${c.regions.join(", ")}"`,
            ]);
            const csv = [
              headers.join(","),
              ...rows.map((r) => r.join(",")),
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `contractors-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* ================================================================== */}
      {/* Stats                                                               */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Total Contractors"
          value={String(stats.total)}
          variant="default"
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <MetricCard
          label="Verified"
          value={String(stats.verified)}
          variant="success"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricCard
          label="Pending Review"
          value={String(stats.pending)}
          variant="warning"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricCard
          label="Avg Rating"
          value={stats.avgRating}
          variant="primary"
          icon={<Star className="w-4 h-4" />}
        />
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search contractors..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Verification */}
          <select
            className="input"
            value={verificationFilter}
            onChange={(e) =>
              setVerificationFilter(e.target.value as VerificationFilter)
            }
          >
            <option value="all">All Statuses</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Category */}
          <select
            className="input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          {/* Region */}
          <select
            className="input"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="all">All Regions</option>
            {Object.entries(REGION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Bulk Actions Bar                                                    */}
      {/* ================================================================== */}
      {selectedIds.size > 0 && (
        <div className="card p-3 flex items-center gap-3 bg-primary-50 border-primary-200">
          <span className="text-sm font-medium text-primary-700">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button className="btn-primary btn-sm" onClick={handleBulkApprove}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve
            </button>
            <button className="btn-danger btn-sm" onClick={handleBulkSuspend}>
              <ShieldOff className="w-3.5 h-3.5" />
              Suspend
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={handleBulkRequestDocs}
              disabled={actionLoading}
              title="Request documents from selected contractors"
            >
              <FileText className="w-3.5 h-3.5" />
              Request Docs
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Contractor Table                                                    */}
      {/* ================================================================== */}
      <div className="table-container">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="table-header w-10">
                <input
                  type="checkbox"
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <SortTh field="businessName" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort}>Business Name</SortTh>
              <SortTh field="verified" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort}>Status</SortTh>
              <SortTh field="rating" sortField={sortField} sortDir={sortDir} toggleSort={toggleSort}>Rating</SortTh>
              <th className="table-header">Categories</th>
              <th className="table-header">Regions</th>
              <th className="table-header">Trust Score</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="table-cell text-center py-10">
                  <span className="text-surface-400">
                    Loading contractors...
                  </span>
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={8} className="table-cell text-center py-10">
                  <div className="flex flex-col items-center gap-2 text-danger-600">
                    <span className="text-sm font-medium">
                      Failed to load contractors
                    </span>
                    <span className="text-xs text-surface-500 max-w-md text-center">
                      {error instanceof Error ? error.message : "Check that you are logged in and NEXT_PUBLIC_API_URL points to the API (e.g. http://localhost:8000)."}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary btn-sm mt-1"
                      onClick={() => refetch()}
                    >
                      Retry
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && !isError && contractors.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center py-10">
                  <span className="text-surface-400">
                    No contractors in the database yet
                  </span>
                </td>
              </tr>
            )}
            {!isLoading && !isError && contractors.length > 0 && sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center py-10">
                  <span className="text-surface-400">
                    No contractors match the current filters
                  </span>
                </td>
              </tr>
            )}
            {sorted.map((contractor) => {
              const trust = getTrustScore(contractor);
              return (
                <tr
                  key={contractor.id}
                  className="table-row cursor-pointer"
                  onClick={() => setDetailContractor(contractor)}
                >
                  <td
                    className="table-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      checked={selectedIds.has(contractor.id)}
                      onChange={() => toggleSelect(contractor.id)}
                    />
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-semibold text-xs flex-shrink-0">
                        {contractor.businessName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-surface-900">
                          {contractor.businessName}
                        </p>
                        <p className="text-xs text-surface-400 font-mono">
                          {contractor.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    {contractor.verified ? (
                      <span className="badge bg-success-50 text-success-700">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Verified
                      </span>
                    ) : (
                      <span className="badge bg-warning-50 text-warning-700">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-warning-500 fill-warning-500" />
                      <span className="font-semibold">
                        {contractor.rating.toFixed(1)}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contractor.categories.slice(0, 2).map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-600"
                        >
                          {CATEGORY_LABELS[cat] ?? cat}
                        </span>
                      ))}
                      {contractor.categories.length > 2 && (
                        <span className="text-[10px] text-surface-400">
                          +{contractor.categories.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contractor.regions.slice(0, 2).map((reg) => (
                        <span
                          key={reg}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-600"
                        >
                          {REGION_LABELS[reg] ?? reg}
                        </span>
                      ))}
                      {contractor.regions.length > 2 && (
                        <span className="text-[10px] text-surface-400">
                          +{contractor.regions.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-surface-100 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            "h-full rounded-full",
                            trust.overallScore >= 80
                              ? "bg-success-500"
                              : trust.overallScore >= 60
                                ? "bg-warning-500"
                                : "bg-danger-500"
                          )}
                          style={{
                            width: `${Math.min(100, trust.overallScore)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-surface-700">
                        {trust.overallScore}
                      </span>
                    </div>
                  </td>
                  <td
                    className="table-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setDetailContractor(contractor)}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ================================================================== */}
      {/* Contractor Detail Modal                                             */}
      {/* ================================================================== */}
      {detailContractor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDetailContractor(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDetailContractor(null);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-100">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-11 h-11 rounded-full bg-primary-100 text-primary-700 font-semibold">
                  {detailContractor.businessName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-surface-900">
                    {detailContractor.businessName}
                  </h2>
                  <p className="text-xs text-surface-400 font-mono">
                    {detailContractor.id}
                  </p>
                </div>
              </div>
              <button
                className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors"
                onClick={() => setDetailContractor(null)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Status & rating */}
              <div className="flex items-center gap-3">
                {detailContractor.verified ? (
                  <span className="badge bg-success-50 text-success-700">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Verified
                  </span>
                ) : (
                  <span className="badge bg-warning-50 text-warning-700">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending Verification
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-warning-500 fill-warning-500" />
                  <span className="text-sm font-semibold">
                    {detailContractor.rating.toFixed(1)}
                  </span>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                  Contact Information
                </h3>
                {detailContractor.email && (
                  <div className="flex items-center gap-2 text-sm text-surface-700">
                    <Mail className="w-4 h-4 text-surface-400" />
                    {detailContractor.email}
                  </div>
                )}
                {detailContractor.phone && (
                  <div className="flex items-center gap-2 text-sm text-surface-700">
                    <Phone className="w-4 h-4 text-surface-400" />
                    {detailContractor.phone}
                  </div>
                )}
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                  Service Categories
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailContractor.categories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700"
                    >
                      <Tag className="w-3 h-3" />
                      {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Regions */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                  Service Regions
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailContractor.regions.map((reg) => (
                    <span
                      key={reg}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-100 text-surface-600"
                    >
                      <MapPin className="w-3 h-3" />
                      {REGION_LABELS[reg] ?? reg}
                    </span>
                  ))}
                </div>
              </div>

              {/* Verification Provenance (Phase 3 - gov data + internal review) */}
              <VerificationProvenanceSection contractorId={detailContractor.id} />

              {/* Trust Score Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">
                  Trust Score Breakdown
                </h3>
                {(() => {
                  const trust = getTrustScore(detailContractor);
                  return (
                    <div className="space-y-2.5">
                      <TrustScoreBar
                        label="License Verification"
                        value={trust.licenseVerification}
                      />
                      <TrustScoreBar
                        label="Customer Reviews"
                        value={trust.customerReviews}
                      />
                      <TrustScoreBar
                        label="Response Time"
                        value={trust.responseTime}
                      />
                      <TrustScoreBar
                        label="Completion Rate"
                        value={trust.completionRate}
                      />
                      <TrustScoreBar
                        label="Years in Business"
                        value={trust.yearsInBusiness}
                      />
                      <div className="pt-2 border-t border-surface-100 flex items-center justify-between">
                        <span className="text-sm font-semibold text-surface-700">
                          Overall Trust Score
                        </span>
                        <span
                          className={clsx(
                            "text-lg font-bold",
                            trust.overallScore >= 80
                              ? "text-success-600"
                              : trust.overallScore >= 60
                                ? "text-warning-600"
                                : "text-danger-600"
                          )}
                        >
                          {trust.overallScore}/100
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                {!detailContractor.verified ? (
                  <button
                    className="btn-primary flex-1"
                    disabled={actionLoading}
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await approveContractor(detailContractor.id);
                        await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
                        setDetailContractor(null);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to approve contractor");
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {actionLoading ? "Approving..." : "Approve"}
                  </button>
                ) : (
                  <button
                    className="btn-danger flex-1"
                    disabled={actionLoading}
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await suspendContractor(detailContractor.id);
                        await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
                        setDetailContractor(null);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to suspend contractor");
                      } finally {
                        setActionLoading(false);
                      }
                    }}
                  >
                    <ShieldOff className="w-4 h-4" />
                    {actionLoading ? "Suspending..." : "Suspend"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  disabled={actionLoading}
                  onClick={async () => {
                    if (!detailContractor) return;
                    setActionLoading(true);
                    try {
                      await requestDocuments(detailContractor.id);
                      await queryClient.invalidateQueries({ queryKey: ["admin", "contractors"] });
                      alert("Document request sent. The contractor will see it in their profile.");
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Failed to send request");
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  title="Request the contractor to upload additional documents"
                >
                  <FileText className="w-4 h-4" />
                  {actionLoading ? "Sending..." : "Request Documents"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
