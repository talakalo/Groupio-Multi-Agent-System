"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Mail,
  Phone,
  Loader2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { getDefaultRouteForRole } from "@/lib/constants/roleRouting";
import { apiClient, ApiError } from "@/lib/api/client";
import { setAuthCookie } from "@/lib/auth/setAuthCookie";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, "נא להזין כתובת אימייל או מספר טלפון")
    .refine(
      (val) =>
        val.includes("@") || /^0\d{8,9}$/.test(val.replace(/[-\s]/g, "")),
      "נא להזין כתובת אימייל תקינה או מספר טלפון ישראלי"
    ),
  password: z.string().min(6, "סיסמה חייבת להכיל לפחות 6 תווים"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type LoginMethod = "email" | "phone";

export default function LoginPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendEmail, setResendEmail] = useState<string>("");
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
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
          // Fire-and-forget locale cookie — don't block redirect for faster perceived login
          fetch("/api/locale", {
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
      const role = user?.role ?? "";
      router.push(getDefaultRouteForRole(role));
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const status = err instanceof ApiError ? err.status : null;
      const is401 = status === 401;
      const is403 = status === 403;
      const is423 = status === 423;
      const is503 = status === 503;
      const is500 = status === 500;
      const isConnectionError =
        !is401 &&
        !is403 &&
        !is423 &&
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
        setError("האימייל לא אומת. נא לבדוק את תיבת הדואר ולחצו על קישור האימות, או לשלוח קישור מחדש.");
      } else {
        setError(
          is401
            ? "אימייל או סיסמה שגויים. נסו שוב."
            : is423
              ? "החשבון נחסם. פנו לתמיכה."
              : is503
                ? "השירות לא זמין כרגע. נסו שוב מאוחר יותר."
                : is500
                  ? "אירעה שגיאה בשרת. נסה שוב."
                  : isConnectionError
                    ? "לא ניתן להתחבר לשרת. נסה שוב."
                    : rawMessage || "אירעה שגיאה בהתחברות. נסו שוב."
        );
      }
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          ברוכים הבאים חזרה
        </h1>
        <p className="text-gray-600">התחברו כדי להמשיך לחסוך</p>
      </div>

      {/* Email/Phone toggle — segmented control */}
      <div className="bg-gray-100 rounded-xl p-1 flex mb-6">
      <button
        type="button"
        onClick={() => setLoginMethod("email")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
          loginMethod === "email"
            ? "bg-white text-primary-600 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        <Mail className="h-4 w-4" />
        אימייל
      </button>
      <button
        type="button"
        onClick={() => setLoginMethod("phone")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
          loginMethod === "phone"
            ? "bg-white text-primary-600 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        )}
      >
        <Phone className="h-4 w-4" />
        טלפון
      </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" />
            <p className="flex-1">{error}</p>
          </div>
          {showResendVerification && resendEmail && (
            <div className="pt-2 border-t border-red-200">
              {resendSent ? (
                <p className="text-emerald-700 text-xs">
                  נשלח אליכם קישור אימות. בדקו את תיבת הדואר.
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
                      setError("שליחת קישור נכשלה. נסו שוב מאוחר יותר.");
                    } finally {
                      setResending(false);
                    }
                  }}
                  className="text-primary-600 hover:text-primary-700 font-medium text-xs underline underline-offset-1"
                >
                  {resending ? "שולח..." : "לשלוח קישור אימות מחדש"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor="identifier"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          {loginMethod === "email" ? "כתובת אימייל" : "מספר טלפון"}
        </label>
        <input
          id="identifier"
          type={loginMethod === "email" ? "email" : "tel"}
          autoComplete={loginMethod === "email" ? "email" : "tel"}
          placeholder={
            loginMethod === "email" ? "your@email.com" : "050-1234567"
          }
          className="input-field"
          aria-describedby={errors.identifier ? "identifier-error" : undefined}
          aria-invalid={!!errors.identifier}
          {...register("identifier")}
        />
        {errors.identifier && (
          <p
            id="identifier-error"
            role="alert"
            className="text-red-500 text-sm mt-1"
          >
            {errors.identifier.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          סיסמה
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="הזינו סיסמה"
          className="input-field"
          aria-describedby={errors.password ? "password-error" : undefined}
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p
            id="password-error"
            role="alert"
            className="text-red-500 text-sm mt-1"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <label htmlFor="remember" className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            autoComplete="off"
            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
          />
          <span className="text-gray-600">זכור אותי</span>
        </label>
        <Link
          href="/forgot-password"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          שכחתי סיסמה
        </Link>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>מתחבר...</span>
          </>
        ) : (
          <>
            <span>התחברות</span>
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </>
        )}
      </button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-gray-600 mt-6">
        אין לכם חשבון?{" "}
        <Link
          href="/signup"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          הירשמו עכשיו
        </Link>
      </p>
    </>
  );
}
