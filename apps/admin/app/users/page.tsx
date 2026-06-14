"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  Search,
  Filter,
  Plus,
  UserCog,
  Shield,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  Mail,
  Phone,
  Lock,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { apiV1 } from "@/lib/backend-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "resident" | "contractor" | "admin" | "super_admin";
  status: "active" | "suspended";
  created_at: string;
}

type RoleFilter = "all" | "resident" | "contractor" | "admin" | "super_admin";
type StatusFilter = "all" | "active" | "suspended";
type SortField = "name" | "email" | "role" | "status" | "created_at";
type SortDir = "asc" | "desc";

function SortTh({
  field,
  sortField,
  sortDir,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  return (
    <th
      className="table-header cursor-pointer select-none"
      onClick={() => onSort(field)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSort(field)}
      tabIndex={0}
      role="columnheader"
      aria-sort={sortField === field ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
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

const ROLE_LABELS: Record<string, string> = {
  resident: "Resident",
  contractor: "Contractor",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ROLE_BADGE_CLASSES: Record<string, string> = {
  resident: "bg-surface-100 text-surface-600",
  contractor: "bg-primary-50 text-primary-700",
  admin: "bg-warning-50 text-warning-700",
  super_admin: "bg-danger-50 text-danger-700",
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const fetchOpts = (): RequestInit => ({ credentials: "include", headers: { "Content-Type": "application/json" } });

async function fetchUsers(): Promise<User[]> {
  const res = await fetch(apiV1("/admin/users"), fetchOpts());
  if (!res.ok) throw new Error("Failed to fetch users");
  const data = await res.json();
  const raw = data.users ?? data.items ?? data;
  return (Array.isArray(raw) ? raw : []).map((u: Record<string, unknown>) => ({
    id: String(u.id ?? ""),
    name: String(u.name ?? u.full_name ?? ""),
    email: String(u.email ?? ""),
    phone: u.phone != null ? String(u.phone) : undefined,
    role: (u.role ?? "resident") as User["role"],
    status: u.is_active === false ? "suspended" : "active",
    created_at: String(u.created_at ?? ""),
  }));
}

async function updateUser(
  id: string,
  payload: Partial<Pick<User, "role" | "status">>
): Promise<User> {
  const res = await fetch(apiV1(`/admin/users/${id}`), {
    method: "PUT",
    ...fetchOpts(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update user");
  return res.json();
}

async function createUser(payload: {
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<User> {
  const res = await fetch(apiV1("/admin/users"), {
    method: "POST",
    ...fetchOpts(),
    body: JSON.stringify({ ...payload, role: "admin" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || data.message || "Failed to create user");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const queryClient = useQueryClient();

  // ---- Data fetching ----
  const {
    data: users = [],
    isLoading,
    error: fetchError,
  } = useQuery<User[]>({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<Pick<User, "role" | "status">>) =>
      updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", phone: "", password: "" });
    },
  });

  // ---- Filters / sort ----
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ---- Create modal ----
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });

  // ---- Role change dropdown ----
  const [roleDropdownId, setRoleDropdownId] = useState<string | null>(null);

  // ---- Filtering ----
  const filtered = useMemo(() => {
    let result = users;

    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((u) => u.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone && u.phone.includes(q))
      );
    }

    return result;
  }, [users, roleFilter, statusFilter, searchQuery]);

  // ---- Sorting ----
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "role":
          cmp = a.role.localeCompare(b.role);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
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
    const active = users.filter((u) => u.status === "active").length;
    const suspended = users.filter((u) => u.status === "suspended").length;
    const admins = users.filter(
      (u) => u.role === "admin" || u.role === "super_admin"
    ).length;
    return { total: users.length, active, suspended, admins };
  }, [users]);

  // ---- Sort toggle ----
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ---- Action handlers ----
  const handleToggleStatus = useCallback(
    (user: User) => {
      const newStatus = user.status === "active" ? "suspended" : "active";
      updateMutation.mutate({ id: user.id, status: newStatus });
    },
    [updateMutation]
  );

  const handleChangeRole = useCallback(
    (userId: string, newRole: User["role"]) => {
      updateMutation.mutate({ id: userId, role: newRole });
      setRoleDropdownId(null);
    },
    [updateMutation]
  );

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      createMutation.mutate(createForm);
    },
    [createForm, createMutation]
  );

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Manage platform users, roles, and access
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="w-4 h-4" />
          Create Admin User
        </button>
      </div>

      {/* ================================================================== */}
      {/* Stats                                                              */}
      {/* ================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card card-hover p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-primary-500" />
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-500 text-white mb-3 shadow-sm">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-surface-900">{stats.total}</p>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wide mt-0.5">Total Users</p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-success-500" />
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-success-500 text-white mb-3 shadow-sm">
            <UserCheck className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-surface-900">{stats.active}</p>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wide mt-0.5">Active</p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-danger-500" />
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-danger-500 text-white mb-3 shadow-sm">
            <UserX className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-surface-900">{stats.suspended}</p>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wide mt-0.5">Suspended</p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-warning-500" />
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-warning-500 text-white mb-3 shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-surface-900">{stats.admins}</p>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wide mt-0.5">Admins</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              className="input pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Role filter */}
          <select
            className="input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          >
            <option value="all">All Roles</option>
            <option value="resident">Resident</option>
            <option value="contractor">Contractor</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>

          {/* Status filter */}
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Users Table                                                        */}
      {/* ================================================================== */}
      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
          <span className="ml-2 text-sm text-surface-500">Loading users...</span>
        </div>
      ) : fetchError ? (
        <div className="card p-10 flex items-center justify-center gap-2 text-danger-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Failed to load users. Please try again.</span>
        </div>
      ) : (
        <div className="table-container">
          <table className="w-full text-left">
            <thead>
              <tr>
                <SortTh field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Name</SortTh>
                <SortTh field="email" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Email</SortTh>
                <th className="table-header">Phone</th>
                <SortTh field="role" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Role</SortTh>
                <SortTh field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Status</SortTh>
                <SortTh field="created_at" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Created</SortTh>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-cell text-center py-10">
                    <span className="text-surface-400">
                      No users match the current filters
                    </span>
                  </td>
                </tr>
              )}
              {sorted.map((user) => (
                <tr key={user.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-semibold text-xs flex-shrink-0">
                        {(user.name || "")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) || "?"}
                      </div>
                      <span className="font-medium text-surface-900">
                        {user.name || user.email || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell text-surface-600">{user.email}</td>
                  <td className="table-cell text-surface-600">
                    {user.phone || "—"}
                  </td>
                  <td className="table-cell">
                    <span
                      className={clsx(
                        "badge",
                        ROLE_BADGE_CLASSES[user.role] || "badge-normal"
                      )}
                    >
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 text-xs font-medium",
                        user.status === "active"
                          ? "text-success-600"
                          : "text-danger-600"
                      )}
                    >
                      <span
                        className={clsx(
                          "w-2 h-2 rounded-full",
                          user.status === "active"
                            ? "bg-success-500"
                            : "bg-danger-500"
                        )}
                      />
                      {user.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="table-cell text-surface-500">
                    {new Date(user.created_at).toLocaleDateString("en-IL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      {/* Suspend / Activate */}
                      <button
                        className={clsx(
                          "btn-sm rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                          user.status === "active"
                            ? "bg-danger-50 text-danger-700 hover:bg-danger-100"
                            : "bg-success-50 text-success-700 hover:bg-success-100"
                        )}
                        onClick={() => handleToggleStatus(user)}
                        disabled={updateMutation.isPending}
                      >
                        {user.status === "active" ? (
                          <>
                            <ShieldOff className="w-3.5 h-3.5 inline mr-1" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5 inline mr-1" />
                            Activate
                          </>
                        )}
                      </button>

                      {/* Change role dropdown */}
                      <div className="relative">
                        <button
                          className="btn-sm rounded-lg px-2.5 py-1.5 text-xs font-medium bg-surface-100 text-surface-700 hover:bg-surface-200 transition-colors"
                          onClick={() =>
                            setRoleDropdownId(
                              roleDropdownId === user.id ? null : user.id
                            )
                          }
                        >
                          <UserCog className="w-3.5 h-3.5 inline mr-1" />
                          Role
                          <ChevronDown className="w-3 h-3 inline ml-0.5" />
                        </button>
                        {roleDropdownId === user.id && (
                          <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white rounded-lg shadow-lg border border-surface-200 py-1">
                            {(
                              [
                                "resident",
                                "contractor",
                                "admin",
                                "super_admin",
                              ] as const
                            ).map((role) => (
                              <button
                                key={role}
                                className={clsx(
                                  "w-full text-left px-3 py-2 text-xs hover:bg-surface-50 transition-colors",
                                  user.role === role
                                    ? "font-semibold text-primary-700 bg-primary-50"
                                    : "text-surface-700"
                                )}
                                onClick={() => handleChangeRole(user.id, role)}
                              >
                                {ROLE_LABELS[role]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ================================================================== */}
      {/* Create Admin User Modal                                            */}
      {/* ================================================================== */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowCreateModal(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setShowCreateModal(false);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-surface-100">
              <h2 className="text-lg font-bold text-surface-900">
                Create Admin User
              </h2>
              <button
                className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {createMutation.isError && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200">
                  <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-danger-700">
                    {(createMutation.error as Error)?.message ||
                      "Failed to create user"}
                  </p>
                </div>
              )}

              {/* Name */}
              <div>
                <label htmlFor="create-name" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    id="create-name"
                    type="text"
                    required
                    placeholder="John Doe"
                    className="input pl-9"
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="create-email" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    id="create-email"
                    type="email"
                    required
                    placeholder="admin@groupio.co.il"
                    className="input pl-9"
                    value={createForm.email}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="create-phone" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    id="create-phone"
                    type="tel"
                    required
                    placeholder="+972-50-123-4567"
                    className="input pl-9"
                    value={createForm.phone}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, phone: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="create-password" className="block text-sm font-medium text-surface-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    id="create-password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className="input pl-9"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
