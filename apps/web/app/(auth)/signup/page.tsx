"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { User, Wrench, ArrowLeft, Loader2, Check, Mail, Phone, Lock, Home, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { StepIndicator } from "@/components/shared/StepIndicator";
import { Analytics } from "@/lib/analytics";
import { apiClient, ApiError } from "@/lib/api/client";
import { setAuthCookie } from "@/lib/auth/setAuthCookie";
import { useAuthStore, type User as AuthUser } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils/cn";
import { unwrapPageParams, PageParamsProps } from "@/lib/utils/unwrapPageParams";

type SignupFormData = {
  name: string;
  email: string;
  phone: string;
  password: string;
  buildingId?: string;
};

// buildings_manager accounts are created by a platform admin — not via public signup.
type UserRole = 'resident' | 'contractor';

function coerceAuthStoreRole(role: string): AuthUser['role'] {
  const allowed: AuthUser['role'][] = ['resident','contractor','buildings_manager','admin','super_admin'];
  return (allowed as readonly string[]).includes(role) ? (role as AuthUser['role']) : 'resident';
}

export default function SignupPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const router = useRouter();
  const t = useTranslations("auth.signupPage");
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get('role') as UserRole) || 'resident';
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'role' | 'details'>('role');
  const submittingRef = useRef(false);

  const signupSchema = z.object({
    name: z.string().min(2, t("nameRequired")),
    email: z.string().email(t("emailInvalid")),
    phone: z.string().regex(/^0\d{8,9}$/, t("phoneInvalid")),
    password: z.string()
      .min(8, t("passwordLength"))
      .regex(/[A-Z]/, t("passwordUppercase"))
      .regex(/[0-9]/, t("passwordNumber")),
    buildingId: z.string().optional(),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const ROLE_OPTIONS = [
    {
      value: 'resident' as UserRole,
      icon: User,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      selectedBg: 'bg-emerald-500',
      title: t("roleResidentTitle"),
      description: t("roleResidentDesc"),
      features: [t("roleResidentFeature1"), t("roleResidentFeature2"), t("roleResidentFeature3")],
    },
    {
      value: 'contractor' as UserRole,
      icon: Wrench,
      iconBg: 'bg-sky-50',
      iconColor: 'text-sky-600',
      selectedBg: 'bg-sky-500',
      title: t("roleContractorTitle"),
      description: t("roleContractorDesc"),
      features: [t("roleContractorFeature1"), t("roleContractorFeature2"), t("roleContractorFeature3")],
    },
    // buildings_manager is admin-created (not self-registerable).
    // Do not add it here — the backend enforces this via SELF_REGISTERABLE_ROLES.
  ];

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
        role: selectedRole,
        buildingId: data.buildingId || undefined,
      });
      useAuthStore.getState().setAccessToken(response.token);
      let user: { role: string } | null = null;
      try {
        const meData = (await apiClient.getMe()) as Record<string, unknown> & {
          id: string; email: string; role: string; full_name?: string; fullName?: string;
          phone?: string; preferred_language?: string; preferredLanguage?: string;
          avatar_url?: string; avatarUrl?: string; building_id?: string; buildingId?: string;
          contractor_id?: string; contractorId?: string; is_verified?: boolean; isVerified?: boolean;
        };
        user = { role: meData.role };
        useAuthStore.getState().setUser({
          id: meData.id,
          email: meData.email,
          fullName: meData.full_name ?? meData.fullName ?? '',
          phone: meData.phone ?? '',
          role: coerceAuthStoreRole(meData.role),
          preferredLanguage: (meData.preferred_language ?? meData.preferredLanguage ?? 'he') as 'he' | 'en',
          avatarUrl: meData.avatar_url ?? meData.avatarUrl,
          buildingId: meData.building_id ?? meData.buildingId,
          contractorId: meData.contractor_id ?? meData.contractorId,
          isVerified: meData.is_verified ?? meData.isVerified ?? false,
        });
      } catch { user = { role: selectedRole }; }
      setAuthCookie(response.token, user);
      Analytics.userSignedUp({ role: selectedRole });
      router.push(selectedRole === 'contractor' ? '/contractor/dashboard' : '/dashboard');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      const rawMessage = err instanceof Error ? err.message : String(err);
      const isConnectionError = err instanceof TypeError || rawMessage.includes('Failed to fetch') || rawMessage.includes('Connection refused');
      setError(
        isConnectionError ? t("errorConnection") :
        status === 503 ? t("errorUnavailable") :
        status === 500 ? t("errorServer") :
        status === 429 ? t("errorTooManyRequests") :
        status === 409 ? t("errorEmailExists") :
        rawMessage || t("errorGeneric")
      );
    } finally { submittingRef.current = false; setIsLoading(false); }
  };

  return (
    <>
      <div className="text-center mb-7">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5 text-xs font-semibold" style={{ background: 'rgba(26,154,118,0.07)', border: '1px solid rgba(26,154,118,0.14)', color: '#0d6b4f' }}>
          <Shield className="h-3 w-3" /><span>{t("joinBadge")}</span>
        </div>
        <h1 className="text-[1.85rem] font-extrabold mb-2" style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.15' }}>{t("title")}</h1>
        <p className="text-[0.9375rem]" style={{ color: '#7a9a8a' }}>{t("subtext")}</p>
      </div>

      <StepIndicator
        steps={[{ label: t("stepRole") }, { label: t("stepDetails") }]}
        currentStep={step === 'role' ? 0 : 1}
        variant="bar"
        className="mb-6"
      />

      <div className="rounded-[18px] overflow-hidden" style={{ background: '#ffffff', boxShadow: '0 1px 2px rgba(10,51,41,0.04), 0 6px 20px rgba(10,51,41,0.07), 0 20px 48px rgba(10,51,41,0.05)', border: '1px solid rgba(10,51,41,0.07)' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg, #1a9a76 0%, #0e6b52 60%, #0a4f3b 100%)' }} />
        <div className="p-7 pb-8">

          {step === 'role' && (
            <div className="space-y-3">
              {ROLE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedRole === option.value;
                return (
                  <button key={option.value} type="button" onClick={() => setSelectedRole(option.value)} aria-pressed={isSelected}
                    className={cn('w-full text-right p-4 rounded-2xl border-2 transition-all duration-200', isSelected ? 'border-emerald-500 bg-emerald-50/60 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-emerald-200')}>
                    <div className="flex items-start gap-3">
                      <div className={cn('flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors', isSelected ? option.selectedBg + ' text-white' : option.iconBg + ' ' + option.iconColor)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{option.title}</h3>
                          {isSelected && <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />}
                        </div>
                        <p className="text-slate-500 text-xs mt-0.5">{option.description}</p>
                        <ul className="mt-2 space-y-0.5">
                          {option.features.map((feat) => (
                            <li key={feat} className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Check className="h-2.5 w-2.5 text-emerald-500 flex-shrink-0" />{feat}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </button>
                );
              })}
              <button type="button" onClick={() => setStep('details')} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors mt-5" style={{ height: '2.875rem', fontSize: '0.9375rem' }}>
                <span>{t("continueBtn")}</span><ArrowLeft className="h-4 w-4 rtl-flip" />
              </button>
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {error && <div role="alert" className="rounded-[12px] px-4 py-3.5 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.14)', color: '#b91c1c' }}>{error}</div>}

              <div>
                <label htmlFor="name" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>{t("fullNameLabel")}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}><User className="h-4 w-4" /></div>
                  <input id="name" type="text" autoComplete="name" placeholder={t("fullNamePlaceholder")} className={cn('input-field ps-10', errors.name && 'border-red-400 bg-red-50/30')} aria-describedby={errors.name ? 'name-error' : undefined} aria-invalid={!!errors.name} {...register('name')} />
                </div>
                {errors.name && <p id="name-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>{errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>{t("emailLabel")}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}><Mail className="h-4 w-4" /></div>
                  <input id="email" type="email" autoComplete="email" placeholder="your@email.com" className={cn('input-field ps-10', errors.email && 'border-red-400 bg-red-50/30')} aria-describedby={errors.email ? 'email-error' : undefined} aria-invalid={!!errors.email} {...register('email')} />
                </div>
                {errors.email && <p id="email-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>{t("phoneLabel")}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}><Phone className="h-4 w-4" /></div>
                  <input id="phone" type="tel" autoComplete="tel" placeholder={t("phonePlaceholder")} className={cn('input-field ps-10', errors.phone && 'border-red-400 bg-red-50/30')} aria-describedby={errors.phone ? 'phone-error' : undefined} aria-invalid={!!errors.phone} {...register('phone')} />
                </div>
                {errors.phone && <p id="phone-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>{errors.phone.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>{t("passwordLabel")}</label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}><Lock className="h-4 w-4" /></div>
                  <input id="password" type="password" autoComplete="new-password" placeholder={t("passwordPlaceholder")} className={cn('input-field ps-10', errors.password && 'border-red-400 bg-red-50/30')} aria-describedby={errors.password ? 'password-error' : undefined} aria-invalid={!!errors.password} {...register('password')} />
                </div>
                {errors.password && <p id="password-error" role="alert" className="mt-1.5 text-sm font-medium" style={{ color: '#dc2626' }}>{errors.password.message}</p>}
              </div>

              {selectedRole === 'resident' && (
                <div>
                  <label htmlFor="buildingId" className="block text-sm font-semibold mb-1.5" style={{ color: '#2d4a40' }}>{t("buildingCodeLabel")}</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5" style={{ color: '#9aadaa' }}><Home className="h-4 w-4" /></div>
                    <input id="buildingId" type="text" autoComplete="off" placeholder={t("buildingCodePlaceholder")} className="input-field ps-10" {...register('buildingId')} />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2.5 pt-1">
                <input type="checkbox" id="tos" required className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="tos" className="text-sm" style={{ color: '#6b8c7a' }}>
                  {t("tosText")}{" "}
                  <Link href="/terms" className="font-semibold hover:underline mx-1" style={{ color: '#1a9a76' }}>{t("tosLink")}</Link>
                  {t("and")}{" "}
                  <Link href="/privacy" className="font-semibold hover:underline mx-1" style={{ color: '#1a9a76' }}>{t("privacyLink")}</Link>
                </label>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep('role')} className="flex-1 rounded-xl text-sm font-semibold transition-all" style={{ height: '2.875rem', border: '1.5px solid rgba(26,154,118,0.25)', color: '#0d6b4f', background: 'rgba(26,154,118,0.04)' }}>{t("backBtn")}</button>
                <button type="submit" disabled={isLoading} className="flex-[2] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-70" style={{ height: '2.875rem', fontSize: '0.9375rem' }}>
                  {isLoading ? (<><Loader2 className="h-5 w-5 animate-spin" /><span>{t("signingUp")}</span></>) : (<><span>{t("signupBtn")}</span><ArrowLeft className="h-4 w-4 rtl-flip" /></>)}
                </button>
              </div>
            </form>
          )}

          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
            <span className="text-xs font-medium" style={{ color: '#b0c4bc' }}>{t("alreadyHaveAccount")}</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(10,51,41,0.08)' }} />
          </div>
          <Link href="/login" className="flex items-center justify-center gap-2 w-full rounded-[10px] text-sm font-semibold transition-all duration-200 mt-3" style={{ height: '2.625rem', border: '1.5px solid rgba(26,154,118,0.25)', color: '#0d6b4f', background: 'rgba(26,154,118,0.04)' }}>
            {t("loginExisting")}
          </Link>
        </div>
      </div>
    </>
  );
}
