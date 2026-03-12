"use client";

import { Building2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayStatus = !token ? "error" : status;
  const displayMessage = !token ? "קישור לאימות לא תקין." : errorMessage;

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
            err instanceof ApiError ? err.message : "שגיאה באימות. נסו שוב או בקשו שליחה חוזרת."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, status]);

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
            <h2 className="text-lg font-semibold text-gray-900">מאמתים את האימייל שלכם...</h2>
            <p className="text-sm text-gray-600">אנא המתינו</p>
          </div>
        )}

        {displayStatus === "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle className="h-14 w-14 text-emerald-500" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">האימייל אומת בהצלחה</h2>
            <p className="text-sm text-gray-600">אתם יכולים כעת להתחבר לחשבון שלכם</p>
            <Link
              href="/login"
              className="btn-primary mt-2 inline-flex items-center gap-2"
            >
              מעבר להתחברות
            </Link>
          </div>
        )}

        {displayStatus === "error" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <XCircle className="h-14 w-14 text-red-500" aria-hidden />
            <h2 className="text-lg font-semibold text-gray-900">אימות נכשל</h2>
            <p className={cn("text-sm text-gray-600", "text-red-600")}>{displayMessage}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <Link href="/login" className="btn-secondary">
                חזרה להתחברות
              </Link>
              <Link href="/resend-verification" className="btn-primary">
                שליחת קישור לאימות מחדש
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
          <p className="text-sm text-gray-600">טוען...</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
