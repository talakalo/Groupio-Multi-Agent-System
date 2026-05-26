"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient, ApiError } from "@/lib/api/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("resetPassword");
  const token = searchParams.get("token");

  const schema = z
    .object({
      password: z
        .string()
        .min(8, t("validationMinLength"))
        .regex(/[A-Z]/, t("validationUppercase"))
        .regex(/[0-9]/, t("validationDigit")),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validationMismatch"),
      path: ["confirmPassword"],
    });

  type FormData = z.infer<typeof schema>;

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpiredError, setIsExpiredError] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    if (!token) {
      setError(t("errorExpired"));
      setIsExpiredError(true);
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsExpiredError(false);
    try {
      await apiClient.confirmPasswordReset(token, data.password);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      const message = err instanceof Error ? err.message : "";
      if (status === 400 || message.toLowerCase().includes("expired") || message.toLowerCase().includes("invalid")) {
        setError(t("errorExpired"));
        setIsExpiredError(true);
      } else if (status === 429) {
        setError(t("errorTooManyAttempts"));
        setIsExpiredError(false);
      } else {
        setError(t("errorGeneral"));
        setIsExpiredError(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="card py-8 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-900">{t("invalidLinkTitle")}</h1>
        <p className="text-sm text-gray-600">{t("invalidLinkMessage")}</p>
        <Link href="/forgot-password" className="btn-primary inline-block">
          {t("requestNewLink")}
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card py-8 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-900">{t("successTitle")}</h1>
        <p className="text-sm text-gray-600">{t("successMessage")}</p>
        <Link href="/login" className="btn-primary inline-block">
          {t("loginButton")}
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="text-xl font-bold text-gray-900 mb-2">{t("title")}</h1>
      <p className="text-sm text-gray-600 mb-6">{t("subtitle")}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm space-y-2">
            <p>{error}</p>
            {isExpiredError && (
              <Link href="/forgot-password" className="underline font-medium text-red-700 hover:text-red-800">
                {t("invalidLinkRef")}
              </Link>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="reset-password"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {t("newPasswordLabel")}
          </label>
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder={t("newPasswordPlaceholder")}
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
            {t("confirmPasswordLabel")}
          </label>
          <div className="relative">
            <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder={t("confirmPasswordPlaceholder")}
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
              <span>{t("resetting")}</span>
            </>
          ) : (
            t("submitButton")
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
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
            <p className="text-sm text-gray-500 mt-2">{t("loading")}</p>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>

      <p className="text-center text-sm text-gray-600">
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
