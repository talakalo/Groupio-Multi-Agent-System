"use client";

import { Building2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const t = useTranslations("verifyEmail");
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayStatus = !token ? "error" : status;
  const displayMessage = !token ? t("invalidToken") : errorMessage;

  useEffect(() => {
    if (!token || status !== "pending") return;
    let cancelled = false;
    apiClient
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            err instanceof ApiError ? err.message : t("defaultError")
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, status, t]);

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <Building2 className="h-10 w-10 text-primary-500" />
          <span className="text-2xl font-bold text-primary-600">Groupio</span>
        </Link>
      </div>

      <div className="card text-center">
        {displayStatus === "pending" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-12 w-12 text-primary-500 animate-spin" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">{t("pendingTitle")}</h2>
            <p className="text-sm text-gray-600">{t("pendingSubtitle")}</p>
          </div>
        )}

        {displayStatus === "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="h-14 w-14 text-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">{t("successTitle")}</h2>
            <p className="text-sm text-gray-600">{t("successMessage")}</p>
            <Link
              href="/login"
              className="btn-primary mt-2 inline-flex items-center gap-2"
            >
              {t("proceedToLogin")}
            </Link>
          </div>
        )}

        {displayStatus === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <XCircle className="h-14 w-14 text-red-500" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">{t("errorTitle")}</h2>
            <p className={cn("text-sm text-gray-600", "text-red-600")}>{displayMessage}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <Link href="/login" className="btn-secondary">
                {t("backToLogin")}
              </Link>
              <Link href="/resend-verification" className="btn-primary">
                {t("resendLink")}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  const t = useTranslations("verifyEmail");
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
          <p className="text-sm text-gray-600">{t("loading")}</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
