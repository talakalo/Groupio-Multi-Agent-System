"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Mail, Phone, Loader2, ArrowLeft } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";

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

export default function LoginPage() {
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const isEmail = data.identifier.includes("@");
      const credentials = {
        ...(isEmail
          ? { email: data.identifier }
          : { phone: data.identifier }),
        password: data.password,
      };

      const response = await apiClient.login(credentials);
      useAuthStore.getState().setTokens(response.token, response.refresh_token || '');
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "אירעה שגיאה בהתחברות. נסו שוב."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Building2 className="h-10 w-10 text-primary-500" />
            <span className="text-3xl font-bold text-primary-600">
              Groupio
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
            ברוכים הבאים חזרה
          </h1>
          <p className="text-gray-600">התחברו כדי להמשיך לחסוך</p>
        </div>

        {/* Login Method Toggle */}
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
            <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
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
              placeholder={
                loginMethod === "email"
                  ? "your@email.com"
                  : "050-1234567"
              }
              className="input-field"
              {...register("identifier")}
            />
            {errors.identifier && (
              <p className="text-red-500 text-sm mt-1">
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
              placeholder="הזינו סיסמה"
              className="input-field"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-gray-600">זכור אותי</span>
            </label>
            <a
              href="#"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              שכחתי סיסמה
            </a>
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
          עדיין אין לכם חשבון?{" "}
          <Link
            href="/signup"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            הרשמו חינם
          </Link>
        </p>
      </div>
    </div>
  );
}
