"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  User,
  Wrench,
  ArrowLeft,
  Loader2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { setAuthCookie } from "@/lib/auth/setAuthCookie";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

const signupSchema = z.object({
  name: z.string().min(2, "נא להזין שם מלא (לפחות 2 תווים)"),
  email: z.string().email("נא להזין כתובת אימייל תקינה"),
  phone: z
    .string()
    .regex(
      /^0\d{8,9}$/,
      "נא להזין מספר טלפון ישראלי תקין (למשל 0501234567)"
    ),
  password: z
    .string()
    .min(8, "סיסמה חייבת להכיל לפחות 8 תווים")
    .regex(/[A-Z]/, "סיסמה חייבת להכיל לפחות אות גדולה אחת")
    .regex(/[0-9]/, "סיסמה חייבת להכיל לפחות ספרה אחת"),
  buildingId: z.string().optional(),
});

type SignupFormData = z.infer<typeof signupSchema>;

type UserRole = "resident" | "contractor";

const ROLE_OPTIONS = [
  {
    value: "resident" as UserRole,
    icon: User,
    title: "דייר",
    description: "אני גר בבניין ורוצה ליהנות מהנחות קבוצתיות",
    features: [
      "גישה להצעות קבוצתיות",
      "צ׳אט AI חכם למציאת קבלנים",
      "מעקב אחר חסכונות",
    ],
  },
  {
    value: "contractor" as UserRole,
    icon: Wrench,
    title: "קבלן",
    description: "אני קבלן ורוצה להציע שירותים לבניינים",
    features: [
      "גישה לביקוש מוכח",
      "ניהול הצעות מחיר",
      "חשיפה לדיירים חדשים",
    ],
  },
];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") as UserRole) || "resident";

  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"role" | "details">("role");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.signup({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: selectedRole,
        buildingId: data.buildingId || undefined,
      });

      // Token lives only in the Zustand store (memory). Never write to localStorage —
      // that would expose the JWT to any XSS payload on the page.
      useAuthStore.getState().setAccessToken(response.token);
      let user: { role: string } | null = null;
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const meRes = await fetch(`${apiBase}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${response.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          user = { role: meData.role };
          useAuthStore.getState().setUser({
            id: meData.id,
            email: meData.email,
            fullName: meData.full_name ?? meData.fullName ?? "",
            phone: meData.phone ?? "",
            role: meData.role,
            preferredLanguage: (meData.preferred_language ?? meData.preferredLanguage ?? "he") as "he" | "en",
            avatarUrl: meData.avatar_url ?? meData.avatarUrl,
            buildingId: meData.building_id ?? meData.buildingId,
            contractorId: meData.contractor_id ?? meData.contractorId,
            isVerified: meData.is_verified ?? meData.isVerified ?? false,
          });
        }
      } catch {
        // /me failed; use role from signup for cookie so middleware allows access
        user = { role: selectedRole };
      }
      setAuthCookie(response.token, user);
      router.push(
        selectedRole === "resident"
          ? "/dashboard"
          : "/contractor/dashboard"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "אירעה שגיאה בהרשמה. נסו שוב."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Building2 className="h-10 w-10 text-primary-500" />
            <span className="text-3xl font-bold text-primary-600">
              Groupio
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
            הצטרפו ל-Groupio
          </h1>
          <p className="text-gray-600">התחילו לחסוך עם השכנים שלכם</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              step === "role" ? "text-primary-600" : "text-gray-400"
            )}
          >
            <span className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs">
              1
            </span>
            בחירת תפקיד
          </div>
          <div className="w-8 h-px bg-gray-300" />
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              step === "details" ? "text-primary-600" : "text-gray-400"
            )}
          >
            <span
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs",
                step === "details"
                  ? "bg-primary-500 text-white"
                  : "bg-gray-200 text-gray-500"
              )}
            >
              2
            </span>
            פרטים אישיים
          </div>
        </div>

        {step === "role" && (
          <div className="space-y-4">
            {ROLE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedRole === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedRole(option.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    "w-full text-right card transition-all",
                    isSelected
                      ? "border-primary-500 ring-2 ring-primary-500/20"
                      : "hover:border-gray-300"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-primary-500 text-white"
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-gray-900">
                          {option.title}
                        </h3>
                        {isSelected && (
                          <Check className="h-5 w-5 text-primary-500" />
                        )}
                      </div>
                      <p className="text-gray-600 text-sm mt-1">
                        {option.description}
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {option.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-center gap-2 text-sm text-gray-500"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setStep("details")}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-6"
            >
              <span>המשך</span>
              <ArrowLeft className="h-4 w-4 rtl-flip" />
            </button>
          </div>
        )}

        {step === "details" && (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="card space-y-5"
          >
            {error && (
              <div role="alert" className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                שם מלא
              </label>
              <input
                id="name"
                type="text"
                placeholder="ישראל ישראלי"
                className="input-field"
                aria-describedby={errors.name ? "name-error" : undefined}
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && (
                <p id="name-error" role="alert" className="text-red-500 text-sm mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                placeholder="your@email.com"
                className="input-field"
                aria-describedby={errors.email ? "email-error" : undefined}
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" role="alert" className="text-red-500 text-sm mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                מספר טלפון
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="0501234567"
                className="input-field"
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.phone.message}
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
                placeholder="לפחות 8 תווים, אות גדולה ומספר"
                className="input-field"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {selectedRole === "resident" && (
              <div>
                <label
                  htmlFor="buildingId"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  קוד בניין (אופציונלי)
                </label>
                <input
                  id="buildingId"
                  type="text"
                  placeholder="הזינו קוד בניין אם קיבלתם מהוועד"
                  className="input-field"
                  {...register("buildingId")}
                />
              </div>
            )}

            <div className="flex items-start gap-2 pt-2">
              <input
                type="checkbox"
                id="tos"
                required
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600"
              />
              <label htmlFor="tos" className="text-sm text-gray-600">
                קראתי ומסכים/ה ל
                <Link href="/terms" className="text-primary-600 hover:underline mx-1">
                  תנאי השימוש
                </Link>
                ול
                <Link href="/privacy" className="text-primary-600 hover:underline mx-1">
                  מדיניות הפרטיות
                </Link>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("role")}
                className="btn-secondary flex-1"
              >
                חזרה
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary flex-[2] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>נרשם...</span>
                  </>
                ) : (
                  <>
                    <span>הרשמה</span>
                    <ArrowLeft className="h-4 w-4 rtl-flip" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Login link */}
        <p className="text-center text-gray-600 mt-6">
          כבר יש לכם חשבון?{" "}
          <Link
            href="/login"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            התחברו
          </Link>
        </p>
      </div>
    </div>
  );
}
