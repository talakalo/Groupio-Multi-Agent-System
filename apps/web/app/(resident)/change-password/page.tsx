"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Lock,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient, ApiError } from "@/lib/api/client";
import { useUnwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

type ChangePasswordData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ChangePasswordPage(props: PageParamsProps) {
  useUnwrapPageParams(props);
  const t = useTranslations("profile");

  const changePasswordSchema = z
    .object({
      currentPassword: z.string().min(1, t("currentPasswordRequired")),
      newPassword: z
        .string()
        .min(8, t("passwordMinLength"))
        .regex(/[A-Z]/, t("passwordUppercaseRequired"))
        .regex(/[0-9]/, t("passwordNumberRequired")),
      confirmPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("passwordMismatch"),
      path: ["confirmPassword"],
    });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordData) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.changePassword(data.currentPassword, data.newPassword);
      setSuccess(true);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          setError(t("currentPasswordWrong"));
        } else if (err.status === 429) {
          setError(t("passwordUpdateFailed"));
        } else {
          setError(t("passwordUpdateFailed"));
        }
      } else {
        setError(t("unexpectedError"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <main className="max-w-md mx-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">{t("passwordUpdated")}</h1>
          <p className="text-gray-600">{t("passwordSaved")}</p>
          <Link href="/profile" className="btn-primary inline-block">
            {t("backToProfile")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
        <div className="text-center">
          <Lock className="w-10 h-10 text-primary-600 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-gray-900">{t("changePassword")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("passwordSubtitle")}</p>
        </div>

        {error && (
          <div
            className="bg-red-50 text-red-700 rounded-xl p-3 flex items-center gap-2 text-sm"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
              {t("currentPassword")}
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showCurrent ? "text" : "password"}
                autoComplete="current-password"
                className="input-field w-full pe-10"
                aria-invalid={!!errors.currentPassword}
                aria-describedby={errors.currentPassword ? "current-error" : undefined}
                {...register("currentPassword")}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.currentPassword && (
              <p id="current-error" className="text-sm text-red-600 mt-1">
                {errors.currentPassword.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
              {t("newPassword")}
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                className="input-field w-full pe-10"
                aria-invalid={!!errors.newPassword}
                aria-describedby={errors.newPassword ? "new-error" : undefined}
                {...register("newPassword")}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPassword && (
              <p id="new-error" className="text-sm text-red-600 mt-1">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              {t("confirmPassword")}
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="input-field w-full"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p id="confirm-error" className="text-sm text-red-600 mt-1">
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
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
            {isLoading ? t("changing") : t("changePasswordBtn")}
          </button>
        </form>

        <div className="text-center">
          <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-700">
            {t("cancel")}
          </Link>
        </div>
      </div>
    </main>
  );
}
