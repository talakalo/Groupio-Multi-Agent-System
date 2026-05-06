'use client';

import type { Offer, ServiceCategory } from '@groupio/types';
import { formatPrice } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Tag,
  Users,
  TrendingDown,
  ArrowLeft,
  Clock,
  Wrench,
  MessageSquare,
  Search,
  Building2,
  AlertCircle,
  Star,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/shared/EmptyState';
import { apiClient, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  activeOffers: number;
  neighborsJoined: number;
  totalSavings: number;
  buildingName: string;
}

interface RecentActivity {
  id: string;
  type: 'offer_joined' | 'offer_created' | 'contractor_matched' | 'tier_reached';
  message: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  color: 'primary' | 'accent' | 'emerald' | 'amber';
}) {
  const colorMap = {
    primary: { bg: 'bg-primary-100', text: 'text-primary-600', icon: 'text-primary-500' },
    accent: { bg: 'bg-accent-100', text: 'text-accent-600', icon: 'text-accent-500' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', icon: 'text-emerald-500' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-600', icon: 'text-amber-500' },
  };
  const colors = colorMap[color];

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {trend !== undefined && (
            <p
              className={cn(
                'text-xs mt-1 font-medium',
                trend >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}
            >
              {trend >= 0 ? '+' : ''}
              {trend}% {trendLabel}
            </p>
          )}
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', colors.bg)}>
          <Icon className={cn('h-6 w-6', colors.icon)} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offer Card (compact)
// ---------------------------------------------------------------------------

function OfferCardCompact({ offer }: { offer: Offer }) {
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Link href={`/offers/${offer.id}`} className="card group hover:border-primary-200 block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="badge-primary text-xs">{tCat(offer.category)}</span>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg font-bold text-gray-900">{formatPrice(currentTier?.price ?? offer.basePrice)}</span>
            {discountPercent > 0 && (
              <span className="text-sm text-emerald-600 font-medium">
                {t('discount', { percent: discountPercent })}
              </span>
            )}
          </div>
        </div>
        <ChevronLeft className="h-5 w-5 text-gray-300 group-hover:text-primary-500 transition-colors rtl-flip" />
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {t('participants', { count: offer.participants })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {t('expiresIn', { days: daysLeft })}
        </span>
      </div>

      {/* Progress bar for tier advancement */}
      {offer.tiers.length > 1 && offer.currentTier < offer.tiers.length - 1 && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (offer.participants / (offer.tiers[offer.currentTier + 1]?.min ?? offer.participants)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {t('nextTier', {
              needed: Math.max(0, (offer.tiers[offer.currentTier + 1]?.min ?? 0) - offer.participants),
              discount: Math.round((offer.tiers[offer.currentTier + 1]?.discount ?? 0) * 100),
            })}
          </p>
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Quick Action
// ---------------------------------------------------------------------------

function QuickAction({
  icon: Icon,
  label,
  href,
  color,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:border-primary-200 hover:shadow-sm transition-all"
    >
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', color)}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <span className="text-sm font-medium text-gray-700 text-center">{label}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResidentDashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');

  const accessToken = useAuthStore((s) => s.accessToken);
  const userName = useAuthStore((s) => s.user?.fullName) ?? '';

  // Fetch dashboard stats from building endpoint. A 404 is the expected
  // shape for users who haven't joined a building yet — render the empty
  // dashboard rather than surfacing it as an error.
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['resident', 'dashboard', 'stats'],
    queryFn: async () => {
      try {
        const data = (await apiClient.getMyBuilding()) as Record<string, unknown> & {
          activeOffers?: unknown[];
          residents?: unknown[];
          totalSavings?: number;
          total_savings?: number;
          name?: string;
          address?: string;
        };
        return {
          activeOffers: Array.isArray(data.activeOffers) ? data.activeOffers.length : 0,
          neighborsJoined: Array.isArray(data.residents) ? data.residents.length : 0,
          totalSavings: data.totalSavings ?? data.total_savings ?? 0,
          buildingName: data.name ?? data.address ?? '-',
        };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { activeOffers: 0, neighborsJoined: 0, totalSavings: 0, buildingName: '-' };
        }
        throw err;
      }
    },
    enabled: !!accessToken,
  });

  // Fetch active offers
  const offersQuery = useQuery<{ items: Offer[] }>({
    queryKey: ['resident', 'offers', 'active'],
    queryFn: () =>
      apiClient.getOffers({ status: 'active', page_size: 4 }) as Promise<{ items: Offer[] }>,
    enabled: !!accessToken,
  });

  // Recent activity from the backend. Empty for fresh accounts is fine —
  // surface 404 / empty as the empty state, not an error.
  const activityQuery = useQuery<{ activities: RecentActivity[] }>({
    queryKey: ['resident', 'dashboard', 'activity'],
    queryFn: async () => {
      try {
        const data = (await apiClient.getRecentActivity()) as unknown as {
          activities?: RecentActivity[];
          items?: RecentActivity[];
        };
        return { activities: data.activities ?? data.items ?? [] };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { activities: [] };
        throw err;
      }
    },
    enabled: !!accessToken,
  });

  const stats = statsQuery.data;
  const offers = offersQuery.data?.items ?? [];
  const activities = activityQuery.data?.activities ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {t('welcome', { name: userName || (stats?.buildingName !== '-' ? stats?.buildingName : null) || t('guestName') })}
        </h1>
        <p className="text-gray-500 mt-1">{t('dashboardSubtitle')}</p>
      </div>

      {/* New resident: no building yet */}
      {stats?.buildingName === '-' && (
        <EmptyState
          icon={Building2}
          title="ברוכים הבאים ל-Groupio!"
          description="עדיין לא הצטרפתם לבניין. הצטרפו לבניין שלכם כדי לגשת להצעות קבוצתיות."
          action={{ label: 'הצטרפו לבניין', href: '/building/join' }}
        />
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Tag}
          label={t('activeOffers')}
          value={String(stats?.activeOffers ?? 0)}
          color="primary"
        />
        <StatCard
          icon={Users}
          label={t('neighborsJoined')}
          value={String(stats?.neighborsJoined ?? 0)}
          color="accent"
        />
        <StatCard
          icon={TrendingDown}
          label={t('totalSavings')}
          value={formatPrice(stats?.totalSavings ?? 0)}
          color="emerald"
        />
        <StatCard
          icon={Building2}
          label={t('yourBuilding')}
          value={stats?.buildingName ?? '-'}
          color="amber"
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="section-title">{t('quickActions')}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-4">
          <QuickAction
            icon={Search}
            label={t('findContractor')}
            href="/contractors"
            color="bg-primary-500"
          />
          <QuickAction
            icon={Tag}
            label={t('viewOffers')}
            href="/offers"
            color="bg-accent-500"
          />
          <QuickAction
            icon={MessageSquare}
            label={t('askQuestion')}
            href="/chat"
            color="bg-emerald-500"
          />
        </div>
      </div>

      {/* Active offers + Recent activity side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active offers - takes 2 cols */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t('activeOffers')}</h2>
            <Link
              href="/offers"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              {t('viewAll')}
              <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
            </Link>
          </div>

          {offersQuery.isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                  <div className="h-6 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-48" />
                </div>
              ))}
            </div>
          ) : offersQuery.isError ? (
            <div role="alert" className="card border-red-200 bg-red-50 text-center py-8">
              <AlertCircle className="h-10 w-10 text-red-300 mx-auto mb-2" />
              <p className="text-red-700 text-sm font-medium mb-2">{t('errorLoadingOffers')}</p>
              <button
                type="button"
                onClick={() => offersQuery.refetch()}
                className="text-xs text-red-600 underline hover:text-red-800"
              >
                {t('retry')}
              </button>
            </div>
          ) : offers.length > 0 ? (
            <div className="space-y-4">
              {offers.map((offer: Offer) => (
                <OfferCardCompact key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12">
              <Tag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t('noActiveOffers')}</p>
              <Link href="/offers" className="btn-primary mt-4 inline-flex items-center gap-2">
                <span>{t('browseOffers')}</span>
                <ArrowLeft className="h-4 w-4 rtl-flip" />
              </Link>
            </div>
          )}
        </div>

        {/* Recent activity - takes 1 col */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('recentActivity')}</h2>
          <div className="card p-0 divide-y divide-gray-50">
            {activityQuery.isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                      <div className="h-2 bg-gray-200 rounded w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityQuery.isError ? (
              <div role="alert" className="p-6 text-center">
                <p className="text-sm text-red-600 mb-2">{t('errorLoadingActivity')}</p>
                <button
                  type="button"
                  onClick={() => activityQuery.refetch()}
                  className="text-xs text-red-500 underline"
                >
                  {t('retry')}
                </button>
              </div>
            ) : activities.length > 0 ? (
              activities.map((activity) => {
                const iconMap = {
                  offer_joined: Users,
                  offer_created: Tag,
                  contractor_matched: Wrench,
                  tier_reached: Star,
                };
                const ActivityIcon = iconMap[activity.type] ?? Tag;

                return (
                  <div key={activity.id} className="flex items-start gap-3 p-4">
                    <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <ActivityIcon className="h-4 w-4 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{activity.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(activity.timestamp).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-400">{t('noRecentActivity')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
