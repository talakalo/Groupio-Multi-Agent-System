"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Admin buildings page.
//
// Mirrors the BM "buildings" experience inside the admin shell so an admin
// or super_admin can create a building, copy/share the invite code, and
// rotate it without bouncing through the buildings-manager subdomain.
// ---------------------------------------------------------------------------

const REGIONS = [
  "center",
  "tel_aviv",
  "jerusalem",
  "north",
  "south",
  "sharon",
  "shfela",
] as const;
type Region = (typeof REGIONS)[number];

interface BuildingRow {
  id: string;
  name: string;
  address: string;
  city: string;
  region?: string;
  total_units?: number;
  invite_code?: string;
  admin_user_id?: string;
}

function backendBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
  if (!raw) return "http://localhost:8000";
  return raw.endsWith("/api/v1") ? raw.replace(/\/api\/v1$/, "") : raw;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${backendBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = (await res.json()).detail;
    } catch {
      // ignore
    }
    throw new Error(detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export default function AdminBuildingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [highlight, setHighlight] = useState<BuildingRow | null>(null);

  const buildingsQuery = useQuery<{ items: BuildingRow[]; total: number }>({
    queryKey: ["admin", "buildings"],
    queryFn: () => fetchJson("/api/v1/buildings/?page_size=100"),
  });

  const items = buildingsQuery.data?.items ?? [];
  const filtered = search
    ? items.filter(
        (b) =>
          (b.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (b.address ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (b.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (b.invite_code ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const rotate = useMutation({
    mutationFn: async (buildingId: string) =>
      fetchJson<{ building_id: string; invite_code: string }>(
        `/api/v1/buildings/${encodeURIComponent(buildingId)}/regenerate-invite`,
        { method: "POST" },
      ),
    onSuccess: (data) => {
      setHighlight((h) =>
        h && h.id === data.building_id ? { ...h, invite_code: data.invite_code } : h,
      );
      qc.invalidateQueries({ queryKey: ["admin", "buildings"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Buildings</h1>
          <p className="text-sm text-surface-500 mt-1">
            {buildingsQuery.data?.total ?? 0} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          data-testid="admin-open-building-create"
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          Create building
        </button>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, address, city, code…"
          className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-surface-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
      </div>

      {buildingsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl bg-white p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : buildingsQuery.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {(buildingsQuery.error as Error)?.message ?? "Failed to load buildings"}
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center">
          <Building2 className="h-12 w-12 text-surface-300 mx-auto mb-3" />
          <p className="text-surface-500">No buildings yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="admin-buildings-list">
          {filtered.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-surface-200 bg-white p-5 hover:border-primary-300"
            >
              <button
                type="button"
                className="text-left w-full"
                onClick={() => setHighlight(b)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-surface-900">{b.name}</p>
                    <p className="text-xs text-surface-500">
                      {b.address}, {b.city}
                    </p>
                  </div>
                  {b.invite_code ? (
                    <span className="font-mono text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700">
                      {b.invite_code}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-xs text-surface-500">
                  {b.total_units ?? 0} units
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {highlight ? (
        <BuildingInviteCard
          building={highlight}
          onRotate={() => rotate.mutate(highlight.id)}
          isRotating={rotate.isPending}
          rotateError={rotate.isError ? (rotate.error as Error)?.message : null}
        />
      ) : null}

      {createOpen ? (
        <CreateBuildingModal
          onClose={() => setCreateOpen(false)}
          onCreated={(b) => {
            setHighlight(b);
            qc.invalidateQueries({ queryKey: ["admin", "buildings"] });
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite-card subcomponent
// ---------------------------------------------------------------------------

function BuildingInviteCard({
  building,
  onRotate,
  isRotating,
  rotateError,
}: {
  building: BuildingRow;
  onRotate: () => void;
  isRotating: boolean;
  rotateError: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const code = building.invite_code ?? "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no clipboard — silently no-op
    }
  };

  return (
    <div
      className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5"
      data-testid="admin-building-invite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Invite code — {building.name}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-emerald-900">
            {code || "—"}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!code}
            data-testid="admin-building-copy"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onRotate}
            disabled={isRotating}
            data-testid="admin-building-rotate"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-gray-300"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRotating ? "animate-spin" : ""}`}
            />
            Rotate
          </button>
        </div>
      </div>
      {rotateError ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {rotateError}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function CreateBuildingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (b: BuildingRow) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    address: string;
    city: string;
    region: Region;
    total_units: number;
    floors: number;
  }>({
    name: "",
    address: "",
    city: "",
    region: "tel_aviv",
    total_units: 0,
    floors: 1,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = useMutation({
    mutationFn: () =>
      fetchJson<BuildingRow>("/api/v1/buildings/", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: (b) => {
      onCreated(b);
      onClose();
    },
    onError: (err) => setError((err as Error)?.message ?? "Failed"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={ref}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        data-testid="admin-building-create-modal"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Create a building</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-surface-400 hover:bg-surface-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!form.name.trim() || !form.address.trim() || !form.city.trim()) {
              setError("Name, address and city are required");
              return;
            }
            create.mutate();
          }}
          className="space-y-3"
        >
          <Input
            label="Name"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            data-testid="admin-create-name"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Address"
              value={form.address}
              onChange={(v) => setForm((f) => ({ ...f, address: v }))}
              data-testid="admin-create-address"
            />
            <Input
              label="City"
              value={form.city}
              onChange={(v) => setForm((f) => ({ ...f, city: v }))}
              data-testid="admin-create-city"
            />
          </div>
          <label className="block">
            <span className="block text-sm font-medium text-surface-700">Region</span>
            <select
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value as Region }))}
              className="mt-1 w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total units"
              type="number"
              value={form.total_units}
              onChange={(v) =>
                setForm((f) => ({ ...f, total_units: Number(v) || 0 }))
              }
            />
            <Input
              label="Floors"
              type="number"
              value={form.floors}
              onChange={(v) => setForm((f) => ({ ...f, floors: Number(v) || 1 }))}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-surface-600 hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              data-testid="admin-create-submit"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:bg-gray-300"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  ...rest
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
} & Record<string, unknown>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-surface-700">{label}</span>
      <input
        type={type}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-surface-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
        {...(rest as Record<string, string>)}
      />
    </label>
  );
}
