"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shield, Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Admin login page — single-step email + password authentication.
 *
 * Token storage: access_token and refresh_token are set as HTTP-only cookies
 * by the backend. No token in JS/sessionStorage (reduces XSS exposure).
 * See apps/admin/SECURITY.md.
 */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const res = await fetch(`${API_URL}/api/v1/auth/login/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include", // ensures the HTTP-only refresh_token cookie is set
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || data.message || "Invalid credentials");
        }

        // Verify the user has admin-level role before granting access
        const meRes = await fetch(`${API_URL}/api/v1/auth/me`, {
          credentials: "include",
        });

        if (meRes.ok) {
          const me = await meRes.json();
          const adminRoles = ["admin", "super_admin", "buildings_manager"];
          if (!adminRoles.includes(me.role)) {
            throw new Error("Access denied — this account does not have admin privileges.");
          }
        }

        // access_token and refresh_token are HTTP-only cookies set by the API.
        // Set admin-role cookie for middleware (middleware requires both refresh_token
        // and admin_role_verified).
        if (typeof document !== "undefined") {
          document.cookie =
            "admin_role_verified=1; path=/; SameSite=Strict; max-age=86400";
        }

        router.push("/dashboard");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Login failed. Please check your credentials.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [email, password, router]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 shadow-lg shadow-primary-600/25 mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900">Groupio Admin</h1>
          <p className="text-sm text-surface-500 mt-1">Sign in to the admin dashboard</p>
        </div>

        {/* Card */}
        <div className="card p-6 sm:p-8">
          {/* Error message */}
          {error && (
            <div className="flex items-start gap-3 p-3 mb-6 rounded-lg bg-danger-50 border border-danger-200">
              <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-danger-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-surface-700 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-surface-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@groupio.co.il"
                  className="input pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-surface-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-surface-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="input pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-surface-400 mt-6">
          Groupio Admin Panel &middot; Authorized personnel only
        </p>
      </div>
    </div>
  );
}
