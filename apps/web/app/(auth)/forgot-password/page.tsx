"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle2, Shield } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiClient, ApiError } from "@/lib/api/client";

const schema = z.object({
  email: z.string().email('נא להזין כתובת אימייל תקינה'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.requestPasswordReset(data.email);
      setSent(true);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      if (status === 429) { setError('שלחתם יותר מדי בקשות. המתינו מספר דקות ונסו שוב.'); }
      else { console.error('Password reset request error:', err); setSent(true); }
    } finally { setIsLoading(false); }
  };

  return (
    <>
      <div className="text-center mb-7">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5 text-xs font-semibold" style={{ background: 'rgba(26,154,118,0.07)', border: '1px solid rgba(26,154,118,0.14)', color: '#0d6b4f' }}>
          <Shield className="h-3 w-3" /><span>איפוס סיסמה מאובטח</span>
        </div>
        <h1 className="text-[1.85rem] font-extrabold mb-2" style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.15' }}>שכחתי סיסמה</h1>
        <p className="text-[0.9375rem]" style={{ color: '#7a9a8a' }}>הזינו את האימייל ונשלח קישור לאיפוס</p>
      </div>

      <div className="rounded-[18px] overflow-hidden" style={{ background: '#ffffff', boxShadow: '0 1px 2px rgba(10,51,41,0.04), 0 6px 20px rgba(10,51,41,0.07), 0 20px 48px rgba(10,51,41,0.05)', border: '1px solid rgba(10,51,41,0.07)' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #1a9a76 0%, #0e6b52 60%, #0a4f3b 100%)' }} />
        <div className="p-7 pb-8">

          {sent ? (
            <div className="py-6 text-center space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-slate-900 mb-2">הקישור נשלח!</p>
                <p className="text-sm text-slate-500 leading-relaxed">אם כתובת האימייל קיימת במערכת, ישלח אליה קישור לאיפוס הסיסמה תוך מספר דקות.</p>
                <p className="text-xs text-slate-400 mt-2">בדקו גם את תיקיית הספאם. הקישור בתוקף לשעה אחת.</p>
              </div>
              <Link href="/login" className="inline-flex items-center justify-center w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors" style={{ height: '2.875rem', fontSize: '0.9375rem' }}>
                חזרה להתחברות
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {error && <div role="alert" className="rounded-[12px] px-4 py-3.5 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.14)', color: '#b91c1c' }}>{error}</div>}
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>כתובת אימייל</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}>
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <input id="forgot-email" type="email" autoComplete="email" placeholder="your@email.com"
                    className="input-field ps-10" aria-describedby={errors.email ? 'forgot-email-error' : undefined} aria-invalid={!!errors.email} {...register('email')} />
                </div>
                {errors.email && <p id="forgot-email-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>{errors.email.message}</p>}
              </div>
              <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-70" style={{ height: '2.875rem', fontSize: '0.9375rem' }}>
                {isLoading ? (<><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /><span>שולח...</span></>) : ('שלח קישור לאיפוס סיסמה')}
              </button>
            </form>
          )}

          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
            <span className="text-xs font-medium" style={{ color: '#b0c4bc' }}>נזכרתם בסיסמה?</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
          </div>
          <Link href="/login" className="flex items-center justify-center gap-2 w-full rounded-[10px] text-sm font-semibold transition-all duration-200 mt-3" style={{ height: '2.625rem', border: '1.5px solid rgba(26,154,118,0.25)', color: '#0d6b4f', background: 'rgba(26,154,118,0.04)' }}>
            חזרה להתחברות
          </Link>
        </div>
      </div>
    </>
  );
}
