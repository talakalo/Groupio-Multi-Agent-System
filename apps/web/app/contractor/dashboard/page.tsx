'use client';

import type { Offer, ContractorStats } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import { AIChat } from '@/components/features/chat/AIChat';
import { OfferCard } from '@/components/features/offers/OfferCard';
import { StatCard } from '@/components/shared/StatCard';
import { useAuthStore } from '@/lib/stores/authStore';


export default function ContractorDashboardPage() {
  const t = useTranslations('contractor.dashboard');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [stats, setStats] = useState<ContractorStats | null>(null);
  const [activeOffers, setActiveOffers] = useState<Offer[]>([]);
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        // Get current user to find contractor_id
        const meRes = await fetch(`${apiBase}/api/v1/auth/me`, { headers });
        if (!meRes.ok) throw new Error('Not authenticated');
        const me = await meRes.json();
        const contractorId = me.contractor_id;

        if (contractorId) {
          const [statsRes, offersRes] = await Promise.all([
            fetch(`${apiBase}/api/v1/contractors/${contractorId}/stats`, { headers }),
            fetch(`${apiBase}/api/v1/offers?status=active`, { headers }),
          ]);

          if (statsRes.ok) setStats(await statsRes.json());
          if (offersRes.ok) {
            const data = await offersRes.json();
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

    fetchDashboardData();
  }, [accessToken]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      {/* Stats Overview */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
      </section>

      {/* Trust Score */}
      <section className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t('trustScore.title')}</h2>
          <span className="text-3xl font-bold text-sky-600">
            {stats?.trustScore ?? 0}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-sky-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${stats?.trustScore ?? 0}%` }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.license')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.license ?? 0}/25</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.insurance')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.insurance ?? 0}/20</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.experience')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.experience ?? 0}/15</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.reputation')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.reputation ?? 0}/15</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.completion')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.completion ?? 0}/15</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('trustScore.response')}</span>
            <span className="font-medium">{stats?.trustBreakdown?.response ?? 0}/10</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Pending Offers */}
        <section className="lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">{t('pendingOffers.title')}</h2>
          {pendingOffers.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <p className="text-gray-500">{t('pendingOffers.empty')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingOffers.map((offer: Offer) => (
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

      {/* Active Projects */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t('activeProjects.title')}</h2>
          <a
            href="/contractor/projects"
            className="text-sky-600 hover:text-sky-700 text-sm font-medium"
          >
            {t('activeProjects.viewAll')}
          </a>
        </div>
        {activeOffers.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <p className="text-gray-500">{t('activeProjects.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeOffers.slice(0, 6).map((offer: Offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                variant="contractor"
                compact
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
