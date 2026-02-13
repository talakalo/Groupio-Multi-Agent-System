"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Mail, Lock, KeyRound, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = "credentials" | "2fa";

export default function LoginPage() {
  const router = useRouter();

  // ---- State ----
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const totpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first TOTP input when step changes
  useEffect(() => {
    if (step === "2fa") {
      totpRefs.current[0]?.focus();
    }
  }, [step]);

  // ---- Login handler ----
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const res = await fetch(`${API_URL}/api/v1/auth/login/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || data.message || "Invalid credentials");
        }

        // Store temp token for 2FA verification
        setTempToken(data.token || data.access_token || null);
        setStep("2fa");
      } catch (err: any) {
        setError(err.message || "Login failed. Please check your credentials.");
      } finally {
        setLoading(false);
      }
    },
    [email, password]
  );

  // ---- 2FA handler ----
  const handleVerify2FA = useCallback(
    async (code?: string) => {
      const verifyCode = code || totpCode.join("");
      if (verifyCode.length !== 6) return;

      setError(null);
      setLoading(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (tempToken) {
          headers["Authorization"] = `Bearer ${tempToken}`;
        }

        const res = await fetch(`${API_URL}/api/v1/auth/verify-2fa`, {
          method: "POST",
          headers,
          body: JSON.stringify({ code: verifyCode }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.detail || data.message || "Invalid verification code");
        }

        // Store the final auth token
        const token = data.token || data.access_token || tempToken;
        if (token) {
          localStorage.setItem("auth_token", token);
        }

        router.push("/dashboard");
      } catch (err: any) {
        setError(err.message || "Verification failed. Please try again.");
        // Clear TOTP inputs on error
        setTotpCode(["", "", "", "", "", ""]);
        totpRefs.current[0]?.focus();
      } finally {
        setLoading(false);
      }
    },
    [totpCode, tempToken, router]
  );

  // ---- TOTP input handlers ----
  const handleTotpChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;

      const newCode = [...totpCode];
      newCode[index] = value.slice(-1);
      setTotpCode(newCode);

      // Auto-advance to next input
      if (value && index < 5) {
        totpRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all 6 digits entered
      const fullCode = newCode.join("");
      if (fullCode.length === 6) {
        handleVerify2FA(fullCode);
      }
    },
    [totpCode, handleVerify2FA]
  );

  const handleTotpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !totpCode[index] && index > 0) {
        totpRefs.current[index - 1]?.focus();
      }
    },
    [totpCode]
  );

  const handleTotpPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!pasted) return;

      const newCode = [...totpCode];
      for (let i = 0; i < 6; i++) {
        newCode[i] = pasted[i] || "";
      }
      setTotpCode(newCode);

      if (pasted.length === 6) {
        handleVerify2FA(pasted);
      } else {
        totpRefs.current[Math.min(pasted.length, 5)]?.focus();
      }
    },
    [totpCode, handleVerify2FA]
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
          <p className="text-sm text-surface-500 mt-1">
            {step === "credentials"
              ? "Sign in to the admin dashboard"
              : "Enter your verification code"}
          </p>
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

          {step === "credentials" ? (
            /* ============================================================== */
            /* Step 1: Email + Password                                       */
            /* ============================================================== */
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
          ) : (
            /* ============================================================== */
            /* Step 2: 2FA Verification                                       */
            /* ============================================================== */
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 text-primary-600 mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-surface-900">
                  Two-Factor Authentication
                </h2>
                <p className="text-sm text-surface-500 mt-1">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              {/* TOTP code inputs */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {totpCode.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      totpRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-lg border border-surface-300 bg-white text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors duration-150"
                    value={digit}
                    onChange={(e) => handleTotpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleTotpKeyDown(idx, e)}
                    onPaste={idx === 0 ? handleTotpPaste : undefined}
                    disabled={loading}
                  />
                ))}
              </div>

              {/* Verify button */}
              <button
                onClick={() => handleVerify2FA()}
                disabled={loading || totpCode.join("").length !== 6}
                className="btn-primary w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign in"
                )}
              </button>

              {/* Back link */}
              <button
                type="button"
                className="w-full text-center text-sm text-surface-500 hover:text-primary-600 transition-colors"
                onClick={() => {
                  setStep("credentials");
                  setError(null);
                  setTotpCode(["", "", "", "", "", ""]);
                }}
              >
                Back to login
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-surface-400 mt-6">
          Groupio Admin Panel &middot; Authorized personnel only
        </p>
      </div>
    </div>
  );
}
