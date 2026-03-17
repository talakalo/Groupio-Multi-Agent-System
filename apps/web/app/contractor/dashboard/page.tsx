'use client';

import type { Offer, ContractorStats } from '@groupio/types';
import {
  TrendingUp,
  TrendingDown,
  PlusCircle,
  MessageSquare,
  UserCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import { AIChat } from '@/components/features/chat/AIChat';
import { OfferCard } from '@/components/features/offers/OfferCard';
import { AttentionBanner } from '@/components/shared/AttentionBanner';
import { StatCard } from '@/components/shared/StatCard';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

type OfferTab = 'all' | 'active' | 'pending' | 'completed';

export default function ContractorDashboardPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const t = useTranslations('contractor.dashboard');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [stats, setStats] = useState<ContractorStats | null>(null);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [offersTab, setOffersTab] = useState<OfferTab>('all');
  const [hasDocAction, setHasDocAction] = useState(false);

  useEffect(() => {
    async function fetchDashboardData() {
      let token = accessToken;
      if (isAuthenticated && !token) {
        const ok = await refreshAccessToken();
        if (!ok) return;
        token = useAuthStore.getState().accessToken;
      }
      if (!token) return;

      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      try {
        const meRes = await fetch(`${apiBase}/api/v1/auth/me`, { headers, credentials: 'include' });
        if (!meRes.ok) throw new Error('Not authenticated');
        const me = await meRes.json();
        const contractorId = me.contractor_id;

        if (contractorId) {
          const [statsRes, offersRes, docReqRes] = await Promise.all([
            fetch(`${apiBase}/api/v1/contractors/${contractorId}/stats`, { headers }),
            fetch(`${apiBase}/api/v1/offers?status=active`, { headers }),
            fetch(`${apiBase}/api/v1/contractors/me/doc-requests`, { headers }).catch(() => null),
          ]);

          if (statsRes.ok) setStats(await statsRes.json());
          if (offersRes.ok) {
            const data = await offersRes.json();
            setAllOffers(data.items ?? data.offers ?? []);
          }
          if (docReqRes?.ok) {
            const dr = await docReqRes.json();
            if (dr.pending) setHasDocAction(true);
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

  const filteredOffers = allOffers.filter((o) => {
    if (offersTab === 'all') return true;
    if (offersTab === 'active') return o.status === 'active' || o.status === 'in_progress';
    if (offersTab === 'pending') return o.status === 'pending' || o.status === 'draft';
    if (offersTab === 'completed') return o.status === 'completed';
    return true;
  });

  const trustScore = stats?.trustScore ?? 0;
  const trustColor =
    trustScore >= 80 ? 'text-emerald-600' : trustScore >= 50 ? 'text-amber-500' : 'text-red-500';
  const trustRingColor =
    trustScore >= 80 ? 'stroke-emerald-500' : trustScore >= 50 ? 'stroke-amber-500' : 'stroke-red-500';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    );
  }

  const offerTabs: { key: OfferTab; label: string }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'active', label: 'פעילות' },
    { key: 'pending', label: 'ממתינות' },
    { key: 'completed', label: 'הושלמו' },
  ];

  return (
    <div className="container mx-auto max-w-7xl" dir="rtl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-1">{t('subtitle')}</p>
      </header>

      {/* Attention Banner */}
      {hasDocAction && (
        <AttentionBanner
          variant="warning"
          title="פעולה נדרשת"
          className="mb-6"
          action={{
            label: 'עדכון מסמכים',
            onClick: () => window.location.assign('/contractor/profile?tab=documents'),
          }}
        >
          יש לך מסמכים שצריך לעדכן. עדכן אותם כדי לשמור על ניקוד האמון שלך.
        </AttentionBanner>
      )}

      {/* Stats + Trust Score row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
        {/* Stats cards */}
        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label={t('stats.activeOffers')}
            value={stats?.activeOffers ?? 0}
            trend={stats?.offersTrend}
            icon="briefcase"
          />
          <StatCard
            label={t('stats.completedProjects')}
            value={stats?.completedProjects ?? 0}
            trend={stats?.projectsTrend}
            icon="check-circle"
          />
          <StatCard
            label={t('stats.totalRevenue')}
            value={`₪${(stats?.totalRevenue ?? 0).toLocaleString()}`}
            trend={stats?.revenueTrend}
            icon="currency"
          />
          <StatCard
            label={t('stats.rating')}
            value={stats?.averageRating?.toFixed(1) ?? '0.0'}
            icon="star"
            suffix="/5"
          />
        </div>

        {/* Compact Trust Score */}
        <div className="card flex flex-col items-center justify-center gap-2 p-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="6" />
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                className={trustRingColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(trustScore / 100) * 213.6} 213.6`}
              />
            </svg>
            <span className={cn('absolute inset-0 flex items-center justify-center text-xl font-bold', trustColor)}>
              {trustScore}
            </span>
          </div>
          <span className="text-xs font-medium text-gray-500">ניקוד אמון</span>
        </div>
      </div>

      {/* Quick Actions */}
      <section className="grid grid-cols-3 gap-3 mb-8">
        <Link
          href="/contractor/offers/create"
          className="flex items-center gap-3 p-4 rounded-xl bg-accent-50 hover:bg-accent-100 border border-accent-200 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-accent-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <PlusCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">יצירת הצעה</p>
            <p className="text-xs text-gray-500 hidden sm:block">פרסם הצעה חדשה</p>
          </div>
        </Link>
        <Link
          href="/contractor/dashboard"
          className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">הודעות</p>
            <p className="text-xs text-gray-500 hidden sm:block">צפה בהודעות</p>
          </div>
        </Link>
        <Link
          href="/contractor/profile"
          className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
            <UserCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">עדכון פרופיל</p>
            <p className="text-xs text-gray-500 hidden sm:block">ערוך פרטי עסק</p>
          </div>
        </Link>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Offers section with tabs */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">הצעות</h2>
            <Link
              href="/contractor/offers/active"
              className="text-sky-600 hover:text-sky-700 text-sm font-medium flex items-center gap-1"
            >
              הצג הכל
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
            {offerTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setOffersTab(tab.key)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                  offersTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredOffers.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <p className="text-gray-500">אין הצעות בקטגוריה זו</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOffers.slice(0, 6).map((offer: Offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  variant="contractor"
                  showActions
                />
              ))}
            </div>
          )}
        </section>

        {/* AI Assistant */}
        <section>
          <h2 className="text-xl font-semibold mb-4">{t('assistant.title')}</h2>
          <AIChat
            context="contractor"
            placeholder={t('assistant.placeholder')}
          />
        </section>
      </div>
    </div>
  );
}
