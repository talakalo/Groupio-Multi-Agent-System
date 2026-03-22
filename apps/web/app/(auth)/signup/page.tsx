"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  User,
  Wrench,
  ClipboardList,
  ArrowLeft,
  Loader2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { StepIndicator } from "@/components/shared/StepIndicator";
import { apiClient, ApiError } from "@/lib/api/client";
import { setAuthCookie } from "@/lib/auth/setAuthCookie";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

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

type UserRole = "resident" | "contractor" | "buildings_manager";

const ROLE_OPTIONS = [
  {
    value: "resident" as UserRole,
    icon: User,
    title: "דייר",
    description: "אני דייר בבניין ומחפש להצטרף להצעות קבוצתיות",
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
    description: "אני קבלן ומעוניין להציע שירותים לבניינים",
    features: [
      "גישה לביקוש מוכח",
      "ניהול הצעות מחיר",
      "חשיפה לדיירים חדשים",
    ],
  },
  {
    value: "buildings_manager" as UserRole,
    icon: ClipboardList,
    title: "מנהל בניין",
    description: "אני מנהל בניין ורוצה לנהל את הבניין שלי",
    features: [
      "ניהול דיירים וועד בית",
      "מעקב אחר פניות ותחזוקה",
      "גישה לדוחות ומידע",
    ],
  },
];

export default function SignupPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") as UserRole) || "resident";

  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"role" | "details">("role");
  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.signup({
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: selectedRole === "buildings_manager" ? "resident" : selectedRole,
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
      if (selectedRole === "buildings_manager") {
        router.push("/buildings-manager/dashboard");
        return;
      }
      router.push(
        selectedRole === "contractor"
          ? "/contractor/dashboard"
          : "/dashboard"
      );
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      const msg =
        status === 503
          ? "השירות לא זמין כרגע. נסו שוב מאוחר יותר."
          : status === 500
            ? "אירעה שגיאה בשרת. נסו שוב."
            : status === 429
              ? "יותר מדי ניסיונות. המתינו מספר דקות ונסו שוב."
              : err instanceof Error
                ? err.message
                : "אירעה שגיאה בהרשמה. נסו שוב.";
      setError(msg);
    } finally {
      submittingRef.current = false;
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          הצטרפו ל-Groupio
        </h1>
        <p className="text-gray-600">התחילו לחסוך עם השכנים שלכם</p>
      </div>

      {/* Progress indicator */}
        <StepIndicator
          steps={[{ label: "בחירת תפקיד" }, { label: "פרטים אישיים" }]}
          currentStep={step === "role" ? 0 : 1}
          variant="bar"
          className="mb-8"
        />

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
                    "w-full text-right p-4 rounded-xl border-2 transition-all duration-200",
                    isSelected
                      ? "border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-400/30"
                      : "border-gray-200 bg-white hover:border-primary-200 hover:bg-gray-50/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-primary-500 text-white"
                          : "bg-gray-100 text-gray-500"
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-gray-900">
                          {option.title}
                        </h3>
                        {isSelected && (
                          <Check className="h-5 w-5 text-primary-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-gray-600 text-sm mt-0.5">
                        {option.description}
                      </p>
                      <ul className="mt-2 space-y-0.5">
                        {option.features.slice(0, 3).map((feature) => (
                          <li
                            key={feature}
                            className="flex items-center gap-2 text-xs text-gray-500"
                          >
                            <Check className="h-3 w-3 text-primary-500 flex-shrink-0" />
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
                autoComplete="name"
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
                autoComplete="email"
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
                autoComplete="tel"
                placeholder="0501234567"
                className="input-field"
                aria-describedby={errors.phone ? "phone-error" : undefined}
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              {errors.phone && (
                <p id="phone-error" role="alert" className="text-red-500 text-sm mt-1">
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
                autoComplete="new-password"
                placeholder="לפחות 8 תווים, אות גדולה ומספר"
                className="input-field"
                aria-describedby={errors.password ? "password-error" : undefined}
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p id="password-error" role="alert" className="text-red-500 text-sm mt-1">
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
                  autoComplete="off"
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
    </>
  );
}
