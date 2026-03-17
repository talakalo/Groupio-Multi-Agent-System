"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient, ApiError } from "@/lib/api/client";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "סיסמה חייבת להכיל לפחות 8 תווים")
      .regex(/[A-Z]/, "סיסמה חייבת לכלול לפחות אות גדולה אחת באנגלית")
      .regex(/[0-9]/, "סיסמה חייבת לכלול לפחות ספרה אחת"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    if (!token) {
      setError("קישור האיפוס אינו תקין. בקשו קישור חדש.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.confirmPasswordReset(token, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      const message = err instanceof Error ? err.message : "";
      if (status === 400 || message.toLowerCase().includes("expired") || message.toLowerCase().includes("invalid")) {
        setError("הקישור פג תוקף או אינו תקין. בקשו קישור איפוס חדש.");
      } else if (status === 429) {
        setError("יותר מדי ניסיונות. המתינו מספר דקות ונסו שוב.");
      } else {
        setError("אירעה שגיאה. נסו שוב מאוחר יותר.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="card py-8 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-900">קישור לא תקין</h1>
        <p className="text-sm text-gray-600">
          קישור האיפוס חסר או שגוי. ודאו שהעתקתם את הקישור המלא מהאימייל.
        </p>
        <Link href="/forgot-password" className="btn-primary inline-block">
          בקשת קישור חדש
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card py-8 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-900">הסיסמה אופסה בהצלחה!</h1>
        <p className="text-sm text-gray-600">
          הסיסמה שונתה. מועברים להתחברות...
        </p>
        <Link href="/login" className="btn-primary inline-block">
          התחברות
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="text-xl font-bold text-gray-900 mb-2">איפוס סיסמה</h1>
      <p className="text-sm text-gray-600 mb-6">
        הזינו סיסמה חדשה לחשבונכם. הסיסמה חייבת להכיל לפחות 8 תווים, אות גדולה וספרה.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm space-y-2">
            <p>{error}</p>
            {(error.includes("פג תוקף") || error.includes("לא תקין")) && (
              <Link href="/forgot-password" className="underline font-medium text-red-700 hover:text-red-800">
                בקשת קישור חדש
              </Link>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="reset-password"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            סיסמה חדשה
          </label>
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder="לפחות 8 תווים"
              className="input-field pr-10"
              aria-describedby={errors.password ? "reset-password-error" : undefined}
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p id="reset-password-error" role="alert" className="text-red-500 text-sm mt-1">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            אימות סיסמה
          </label>
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="הזינו שוב את הסיסמה"
              className="input-field pr-10"
              aria-describedby={errors.confirmPassword ? "reset-confirm-password-error" : undefined}
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
          </div>
          {errors.confirmPassword && (
            <p id="reset-confirm-password-error" role="alert" className="text-red-500 text-sm mt-1">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>מאפס...</span>
            </>
          ) : (
            "אפס סיסמה"
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage(props: PageParamsProps) {
  unwrapPageParams(props);
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <Building2 className="h-10 w-10 text-primary-500" />
          <span className="text-2xl font-bold text-primary-600">Groupio</span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="card py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500 mx-auto" aria-hidden="true" />
            <p className="text-sm text-gray-500 mt-2">טוען...</p>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>

      <p className="text-center text-sm text-gray-600">
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          חזרה להתחברות
        </Link>
      </p>
    </div>
  );
}
