"use client";

import { Building2, CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayStatus = !token ? "error" : status;
  const displayMessage = !token ? "קישור לאימות לא תקין." : errorMessage;

  const router = useRouter();

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

  useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => router.push("/login"), 3000);
    return () => clearTimeout(t);
  }, [status, router]);

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
            <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary-500 animate-pulse" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">מאמתים את האימייל שלכם...</h2>
            <p className="text-sm text-gray-600">אנא המתינו — בודקים את הקישור</p>
          </div>
        )}

        {displayStatus === "success" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-emerald-500" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">האימייל אומת בהצלחה</h2>
            <p className="text-sm text-gray-600">מפנים להתחברות תוך רגע...</p>
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
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle className="h-10 w-10 text-red-500" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">אימות נכשל</h2>
            <p className={cn("text-sm text-center max-w-sm", "text-gray-600")}>{displayMessage}</p>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <Link href="/resend-verification" className="btn-primary">
                שלחו שוב
              </Link>
              <Link href="/login" className="btn-secondary">
                חזרה להתחברות
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage(props: PageParamsProps) {
  unwrapPageParams(props);
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
