"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

const schema = z.object({
  email: z.string().email("נא להזין כתובת אימייל תקינה"),
});

type FormData = z.infer<typeof schema>;

export default function ResendVerificationPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.resendVerificationByEmail(data.email);
      setSent(true);
    } catch {
      setError("אירעה שגיאה. נסו שוב מאוחר יותר.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <Building2 className="h-10 w-10 text-primary-500" />
          <span className="text-2xl font-bold text-primary-600">Groupio</span>
        </Link>
      </div>

      <div className="card">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          שליחת קישור אימות מחדש
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          הזינו את כתובת האימייל שלכם ונסלח אליכם קישור לאימות החשבון.
        </p>

        {sent ? (
          <div className="py-4 text-center">
            <p className="text-emerald-600 font-medium">
              נשלח אליכם מייל עם קישור לאימות. בדקו את תיקיית הספאם אם אינכם מוצאים.
            </p>
            <Link href="/login" className="btn-primary mt-4 inline-block">
              חזרה להתחברות
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="resend-email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="resend-email"
                  type="email"
                  placeholder="your@email.com"
                  className="input-field pr-10"
                  aria-describedby={errors.email ? "resend-email-error" : undefined}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p id="resend-email-error" role="alert" className="text-red-500 text-sm mt-1">
                  {errors.email.message}
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
                  <Loader2 className="h-5 w-5 animate-spin" />
                  שולח...
                </>
              ) : (
                "שלח קישור אימות"
              )}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-sm text-gray-600">
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          חזרה להתחברות
        </Link>
      </p>
    </div>
  );
}
