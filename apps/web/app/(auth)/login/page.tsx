"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Phone, Loader2, ArrowLeft, Shield, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Analytics } from "@/lib/analytics";
import { apiClient, ApiError } from "@/lib/api/client";
import { setAuthCookie } from "@/lib/auth/setAuthCookie";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

type LoginFormData = {
  identifier: string;
  password: string;
};

type LoginMethod = "email" | "phone";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth.loginPage");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState<string>("");
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  const loginSchema = z.object({
    identifier: z
      .string()
      .min(1, t("identifierRequired"))
      .refine(
        (val) => val.includes("@") || /^0\d{8,9}$/.test(val.replace(/[-\s]/g, "")),
        t("identifierInvalid")
      ),
    password: z.string().min(6, t("passwordMinLength")),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    setShowResendVerification(false);
    setResendSent(false);

    try {
      const isEmail = data.identifier.includes("@");
      const credentials = {
        ...(isEmail
          ? { email: data.identifier.trim() }
          : { phone: data.identifier.replace(/[-\s]/g, "") }),
        password: data.password,
      };

      const response = await apiClient.login(credentials);
      useAuthStore.getState().setAccessToken(response.token);
      let user: { role: string } | null = null;
      try {
        const meRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/me`,
          { headers: { Authorization: `Bearer ${response.token}` } }
        );
        if (meRes.ok) {
          const meData = await meRes.json();
          user = { role: meData.role };
          const prefLang = (meData.preferred_language ?? meData.preferredLanguage ?? "he") as "he" | "en";
          useAuthStore.getState().setUser({
            id: meData.id,
            email: meData.email,
            fullName: meData.full_name ?? meData.fullName ?? "",
            phone: meData.phone ?? "",
            role: meData.role,
            preferredLanguage: prefLang,
            avatarUrl: meData.avatar_url ?? meData.avatarUrl,
            buildingId: meData.building_id ?? meData.buildingId,
            contractorId: meData.contractor_id ?? meData.contractorId,
            isVerified: meData.is_verified ?? meData.isVerified ?? false,
          });
          await fetch("/api/locale", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: prefLang }),
            credentials: "same-origin",
          }).catch(() => {});
        }
      } catch {
        // /me failed; still set cookie with token so middleware allows access
      }
      setAuthCookie(response.token, user);
      Analytics.userLoggedIn({ role: user?.role ?? "unknown" });
      const role = user?.role ?? "";
      if (role === "admin" || role === "super_admin") {
        router.push("/admin/dashboard");
        return;
      }
      if (role === "buildings_manager") {
        router.push("/buildings-manager/dashboard");
        return;
      }
      if (role === "contractor") {
        router.push("/contractor/dashboard");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const status = err instanceof ApiError ? err.status : null;
      const is401 = status === 401;
      const is403 = status === 403;
      const is503 = status === 503;
      const is500 = status === 500;
      const isConnectionError =
        !is401 &&
        !is403 &&
        !is503 &&
        !is500 &&
        (rawMessage.includes("Connection refused") ||
          rawMessage.includes("Failed to fetch") ||
          rawMessage.includes("NetworkError") ||
          rawMessage.includes("ERR_") ||
          rawMessage.includes("Cannot assign"));
      if (is403 && loginMethod === "email" && data.identifier.includes("@")) {
        setShowResendVerification(true);
        setResendEmail(data.identifier.trim());
        setError(t("errorEmailNotVerified"));
      } else {
        setError(
          is401
            ? t("errorWrongCredentials")
            : is503
              ? t("errorDbUnavailable")
              : is500 || isConnectionError
                ? t("errorServer")
                : rawMessage || t("errorGeneric")
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="text-center mb-7">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5 text-xs font-semibold tracking-wide"
          style={{
            background: 'rgba(26,154,118,0.07)',
            border: '1px solid rgba(26,154,118,0.14)',
            color: '#0d6b4f',
            letterSpacing: '0.04em',
          }}
        >
          <Shield className="h-3 w-3" />
          <span>{t("securedBadge")}</span>
        </div>
        <h1
          className="text-[1.85rem] font-extrabold mb-2"
          style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.15' }}
        >
          {t("welcomeBack")}
        </h1>
        <p className="text-[0.9375rem]" style={{ color: '#7a9a8a' }}>
          {t("welcomeSubtext")}
        </p>
      </div>

      <div
        className="rounded-[18px] overflow-hidden"
        style={{
          background: '#ffffff',
          boxShadow:
            '0 1px 2px rgba(10,51,41,0.04), 0 6px 20px rgba(10,51,41,0.07), 0 20px 48px rgba(10,51,41,0.05)',
          border: '1px solid rgba(10,51,41,0.07)',
        }}
      >
        <div
          style={{
            height: '3px',
            background: 'linear-gradient(90deg, #1a9a76 0%, #0e6b52 60%, #0a4f3b 100%)',
          }}
        />

        <div className="p-7 pb-8">
          <div
            className="flex rounded-[12px] p-[5px] mb-6 gap-1.5"
            style={{ background: 'rgba(10,51,41,0.05)' }}
          >
            {(['email', 'phone'] as const).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setLoginMethod(method)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[9px] text-sm font-semibold transition-all duration-200",
                  loginMethod === method ? "" : "text-gray-400 hover:text-gray-500"
                )}
                style={
                  loginMethod === method
                    ? {
                        background: '#ffffff',
                        color: '#0d6b4f',
                        boxShadow: '0 1px 3px rgba(10,51,41,0.1), 0 1px 2px rgba(10,51,41,0.06)',
                      }
                    : {}
                }
              >
                {method === 'email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                {method === 'email' ? t("byEmail") : t("byPhone")}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-[12px] px-4 py-3.5 text-sm mb-5 space-y-2"
              style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.14)', color: '#b91c1c' }}
            >
              <p>{error}</p>
              {showResendVerification && resendEmail && (
                <div className="pt-2 border-t border-red-100">
                  {resendSent ? (
                    <p className="text-xs" style={{ color: '#065f46' }}>
                      {t("verificationSent")}
                    </p>
                  ) : (
                    <button
                      type="button"
                      disabled={resending}
                      onClick={async () => {
                        setResending(true);
                        try {
                          await apiClient.resendVerificationByEmail(resendEmail);
                          setResendSent(true);
                        } catch {
                          setError(t("resendFailed"));
                        } finally {
                          setResending(false);
                        }
                      }}
                      className="text-xs font-medium underline underline-offset-2"
                      style={{ color: '#b91c1c' }}
                    >
                      {resending ? t("resending") : t("resendVerification")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="mb-1.5 block text-sm font-semibold"
                style={{ color: '#2d4a40' }}
              >
                {loginMethod === "email" ? t("emailLabel") : t("phoneLabel")}
              </label>
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5"
                  style={{ color: '#9aadaa' }}
                >
                  {loginMethod === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                </div>
                <input
                  id="identifier"
                  type={loginMethod === "email" ? "email" : "tel"}
                  autoComplete={loginMethod === "email" ? "email" : "tel"}
                  placeholder={loginMethod === "email" ? t("emailPlaceholder") : t("phonePlaceholder")}
                  className={cn("input-field ps-10", errors.identifier && "border-red-400 bg-red-50/30 focus:border-red-500")}
                  aria-describedby={errors.identifier ? "identifier-error" : undefined}
                  aria-invalid={!!errors.identifier}
                  {...register("identifier")}
                />
              </div>
              {errors.identifier && (
                <p id="identifier-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>
                  {errors.identifier.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-sm font-semibold" style={{ color: '#2d4a40' }}>
                  {t("passwordLabel")}
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold transition-colors" style={{ color: '#1a9a76' }}>
                  {t("forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <div
                  className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5"
                  style={{ color: '#9aadaa' }}
                >
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("passwordPlaceholder")}
                  className={cn("input-field ps-10", errors.password && "border-red-400 bg-red-50/30 focus:border-red-500")}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>
                  {errors.password.message}
                </p>
              )}
            </div>

            <label className="flex items-center gap-2.5 pt-0.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500 h-4 w-4 shrink-0"
              />
              <span className="text-sm" style={{ color: '#6b8c7a' }}>{t("rememberMe")}</span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-1"
              style={{ height: '2.875rem', fontSize: '0.9375rem' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t("submitting")}</span>
                </>
              ) : (
                <>
                  <span>{t("submitBtn")}</span>
                  <ArrowLeft className="h-4 w-4 rtl-flip" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
            <span className="text-xs font-medium" style={{ color: '#b0c4bc' }}>{t("noAccount")}</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
          </div>

          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 w-full rounded-[10px] text-sm font-semibold transition-all duration-200"
            style={{
              height: '2.625rem',
              border: '1.5px solid rgba(26,154,118,0.25)',
              color: '#0d6b4f',
              background: 'rgba(26,154,118,0.04)',
            }}
          >
            {t("signupFree")}
          </Link>
        </div>
      </div>
    </>
  );
}
