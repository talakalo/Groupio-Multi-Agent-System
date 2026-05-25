'use client';

import type { Offer, ContractorStats } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import {
  Briefcase, CheckCircle2, DollarSign, Star,
  ShieldCheck, AlertCircle, ArrowLeft, Clock, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

import { AIChat } from '@/components/features/chat/AIChat';
import { OfferCard } from '@/components/features/offers/OfferCard';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  iconColor = 'text-emerald-600',
  iconBg = 'bg-emerald-50',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  suffix?: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
            {suffix && <span className="text-base font-medium text-slate-400 ms-1">{suffix}</span>}
          </p>
        </div>
        <div className={cn('rounded-2xl p-2.5', iconBg, iconColor)}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function TrustRow({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: pct + '%' }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-10 text-left shrink-0" dir="ltr">
        {score}/{max}
      </span>
    </div>
  );
}

export default function ContractorDashboardPage() {
  const t = useTranslations('contractor.dashboard');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [stats, setStats] = useState<ContractorStats | null>(null);
  const [activeOffers, setActiveOffers] = useState<Offer[]>([]);
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      let token = accessToken;
      if (isAuthenticated && !token) {
        const ok = await refreshAccessToken();
        if (!ok) return;
        token = useAuthStore.getState().accessToken;
      }
      if (!token) return;
      try {
        const me = (await apiClient.getMe()) as Record<string, unknown> & { contractor_id?: string };
        const contractorId = me.contractor_id;
        if (contractorId) {
          const [statsResult, offersResult] = await Promise.allSettled([
            apiClient.getContractorStats(contractorId),
            apiClient.getOffers(undefined, { status: 'active' }),
          ]);
          if (statsResult.status === 'fulfilled') setStats(statsResult.value);
          if (offersResult.status === 'fulfilled') {
            const data = offersResult.value as { items?: Offer[]; offers?: Offer[] };
            const allOffers = data.items ?? data.offers ?? [];
            setActiveOffers(allOffers.filter((o: Offer) => o.status === 'active' || o.status === 'in_progress'));
            setPendingOffers(allOffers.filter((o: Offer) => o.status === 'pending' || o.status === 'draft'));
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDashboardData().catch(() => {});
  }, [accessToken, isAuthenticated, refreshAccessToken]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 p-1">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-20" />
                  <div className="h-7 bg-slate-100 rounded w-16 mt-3" />
                </div>
                <div className="w-10 h-10 bg-slate-100 rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const trustScore = stats?.trustScore ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-1">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <Link
          href="/contractor/offers/create"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
        >
          <span>{t('newOffer') || 'הצעה חדשה'}</span>
          <ArrowLeft className="h-4 w-4 rtl-flip" />
        </Link>
      </div>

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Briefcase}     label={t('stats.activeOffers')}      value={stats?.activeOffers ?? 0}                          iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <StatCard icon={CheckCircle2}  label={t('stats.completedProjects')} value={stats?.completedProjects ?? 0}                     iconColor="text-sky-600"     iconBg="bg-sky-50" />
        <StatCard icon={DollarSign}    label={t('stats.totalRevenue')}      value={'₪' + (stats?.totalRevenue ?? 0).toLocaleString()} iconColor="text-violet-600"  iconBg="bg-violet-50" />
        <StatCard icon={Star}          label={t('stats.rating')}            value={stats?.averageRating?.toFixed(1) ?? '0.0'} suffix="/5" iconColor="text-amber-600" iconBg="bg-amber-50" />
      </div>

      {/* ── Trust Score + Pending Offers (side-by-side on lg) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Trust Score */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{t('trustScore.title')}</h2>
                <p className="text-xs text-slate-400">מבוסס על רישיון, ביטוח, ניסיון וביקורות</p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-3xl font-extrabold text-emerald-600">{trustScore}</p>
              <p className="text-xs text-slate-400">מתוך 100</p>
            </div>
          </div>

          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: trustScore + '%',
                background:
                  trustScore >= 80
                    ? 'linear-gradient(90deg, #1a9a76, #34d399)'
                    : trustScore >= 50
                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(90deg, #ef4444, #f87171)',
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TrustRow label={t('trustScore.license')}    score={stats?.trustBreakdown?.license    ?? 0} max={25} />
            <TrustRow label={t('trustScore.insurance')}  score={stats?.trustBreakdown?.insurance  ?? 0} max={20} />
            <TrustRow label={t('trustScore.experience')} score={stats?.trustBreakdown?.experience ?? 0} max={15} />
            <TrustRow label={t('trustScore.reputation')} score={stats?.trustBreakdown?.reputation ?? 0} max={15} />
            <TrustRow label={t('trustScore.completion')} score={stats?.trustBreakdown?.completion ?? 0} max={15} />
            <TrustRow label={t('trustScore.response')}   score={stats?.trustBreakdown?.response   ?? 0} max={10} />
          </div>
        </div>

        {/* Pending Offers */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">{t('pendingOffers.title')}</h2>
            </div>
            <Link
              href="/contractor/offers/active"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {t('activeProjects.viewAll')}
            </Link>
          </div>

          {pendingOffers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <AlertCircle className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">{t('pendingOffers.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-72">
              {pendingOffers.map((offer: Offer) => (
                <OfferCard key={offer.id} offer={offer} variant="contractor" showActions compact />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Active Projects ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('activeProjects.title')}</h2>
          <Link
            href="/contractor/projects"
            className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            {t('activeProjects.viewAll')}
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </Link>
        </div>
        {activeOffers.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100 text-center">
            <Clock className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">{t('activeProjects.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOffers.slice(0, 6).map((offer: Offer) => (
              <OfferCard key={offer.id} offer={offer} variant="contractor" compact />
            ))}
          </div>
        )}
      </section>

      {/* ── AI Assistant ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold text-slate-900">{t('assistant.title')}</h2>
        </div>
        <AIChat
          context="contractor"
          welcomeMessage={t('assistant.welcomeMessage')}
          placeholder={t('assistant.placeholder')}
          className="max-h-[500px]"
        />
      </section>

    </div>
  );
}
