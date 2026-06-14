'use client';

import type { Building, Offer } from '@groupio/types';
import { formatPrice } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Tag,
  Users,
  ArrowLeft,
  Clock,
  Wrench,
  MessageSquare,
  Building2,
  AlertCircle,
  Star,
  ChevronLeft,
  CalendarClock,
  FileText,
  PhoneCall,
  MessageCircle,
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
// KPI Stat Card — matches reference image style
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  iconColor = 'text-emerald-600',
  iconBg = 'bg-emerald-50',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={cn('rounded-2xl p-2.5', iconBg, iconColor)}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Communications row
// ---------------------------------------------------------------------------

function CommunicationRow({
  icon: Icon,
  title,
  subtitle,
  time,
  iconColor = 'text-emerald-600',
  iconBg = 'bg-emerald-50',
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  time: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl p-3 transition hover:bg-slate-50">
      <div className="flex items-center gap-4">
        <div className={cn('rounded-full p-3', iconBg, iconColor)}>
          <Icon size={18} />
        </div>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <span className="shrink-0 text-sm text-slate-400">{time}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming event row
// ---------------------------------------------------------------------------

function UpcomingRow({
  title,
  subtitle,
  action,
  actionHref,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  action?: string;
  actionHref?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-4',
        highlighted ? 'border-r-4 border-emerald-500 bg-emerald-50' : 'bg-slate-50'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        {action && actionHref && (
          <Link
            href={actionHref}
            className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            {action}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popular Offer card
// ---------------------------------------------------------------------------

function PopularOfferCard({ offer }: { offer: Offer }) {
  const t = useTranslations('offers');

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Link
      href={`/offers/${offer.id}`}
      className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 block hover:border-emerald-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between mb-1">
        <p className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
          {tCat(offer.category)}
        </p>
        <ChevronLeft className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors rtl-flip" />
      </div>
      <p className="text-sm text-slate-500 mb-3">{t('groupOffer')}</p>

      {/* Tier progress bar */}
      {offer.tiers.length > 1 && offer.currentTier < offer.tiers.length - 1 && (
        <div className="mb-3">
          <div className="h-1.5 bg-white rounded-full overflow-hidden ring-1 ring-slate-100">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (offer.participants / (offer.tiers[offer.currentTier + 1]?.min ?? offer.participants)) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Users size={10} />
              {offer.participants}
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={10} />
              {daysLeft}d
            </span>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400">{t('from')}</p>
          <p className="text-xl font-bold text-emerald-700">
            {formatPrice(currentTier?.price ?? offer.basePrice)}
          </p>
        </div>
        {discountPercent > 0 && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {t('upToDiscount', { percent: discountPercent })}
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResidentDashboardPage() {
  const t = useTranslations('dashboard');

  const accessToken = useAuthStore((s) => s.accessToken);
  const userName = useAuthStore((s) => s.user?.fullName) ?? '';

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['resident', 'dashboard', 'stats'],
    queryFn: async () => {
      try {
        const base = await apiClient.getMyBuilding();
        const data = base as Building & { total_savings?: number };
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

  const buildingId = useAuthStore((s) => s.user?.buildingId);

  const offersQuery = useQuery<{ items: Offer[] }>({
    queryKey: ['resident', 'offers', 'active'],
    queryFn: async () => {
      const bid = useAuthStore.getState().user?.buildingId;
      if (!bid) return { items: [], total: 0, page: 1, page_size: 3, has_more: false };
      try {
        return await apiClient.getOffers(bid, { status: 'active', page_size: 3 });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return { items: [], total: 0, page: 1, page_size: 3, has_more: false };
        }
        throw err;
      }
    },
    enabled: !!accessToken && !!buildingId,
  });

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

  const activityIconMap: Record<RecentActivity['type'], React.ElementType> = {
    offer_joined: Users,
    offer_created: Tag,
    contractor_matched: Wrench,
    tier_reached: Star,
  };

  // Derive "upcoming" from the nearest-expiry active offers
  const upcomingOffers = [...offers]
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())
    .slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t('welcome', {
            name: userName || (stats?.buildingName !== '-' ? stats?.buildingName : null) || t('guestName'),
          })}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('dashboardSubtitle')}</p>
      </div>

      {/* No building yet */}
      {stats?.buildingName === '-' && (
        <EmptyState
          icon={Building2}
          title={t('noBuilding.title')}
          description={t('noBuilding.description')}
          action={{ label: t('noBuilding.action'), href: '/building/join' }}
        />
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={MessageCircle}
          label={t('messages')}
          value={String(activities.length || 0)}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          icon={PhoneCall}
          label={t('contractorInquiries')}
          value={String(
            activities.filter((a) => a.type === 'contractor_matched').length || 0
          )}
          iconColor="text-sky-600"
          iconBg="bg-sky-50"
        />
        <StatCard
          icon={CalendarClock}
          label={t('upcomingInstallations')}
          value={String(stats?.activeOffers ?? 0)}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
        />
        <StatCard
          icon={FileText}
          label={t('documentsOffers')}
          value={String(offers.length || 0)}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
      </div>

      {/* Communications + Upcoming */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

        {/* Recent Communications */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{t('recentCommunications')}</h2>
            <Link href="/chat" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
              {t('viewAll')}
            </Link>
          </div>

          {activityQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-4 p-3">
                  <div className="w-11 h-11 bg-slate-100 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-slate-100 rounded w-32" />
                    <div className="h-2.5 bg-slate-100 rounded w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : activityQuery.isError ? (
            <div role="alert" className="flex flex-col items-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-red-300 mb-2" />
              <p className="text-sm text-red-600 mb-2">{t('errorLoadingActivity')}</p>
              <button type="button" onClick={() => activityQuery.refetch()} className="text-xs text-red-500 underline">
                {t('retry')}
              </button>
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-1">
              {activities.slice(0, 5).map((activity) => {
                const Icon = activityIconMap[activity.type] ?? Tag;
                const relativeTime = new Date(activity.timestamp).toLocaleDateString('he-IL');
                return (
                  <CommunicationRow
                    key={activity.id}
                    icon={Icon}
                    title={activity.type === 'contractor_matched' ? 'קבלן' : activity.type === 'offer_joined' ? 'קבוצת הבניין' : 'עדכון'}
                    subtitle={activity.message}
                    time={relativeTime}
                    iconColor={
                      activity.type === 'contractor_matched'
                        ? 'text-sky-600'
                        : activity.type === 'tier_reached'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }
                    iconBg={
                      activity.type === 'contractor_matched'
                        ? 'bg-sky-50'
                        : activity.type === 'tier_reached'
                        ? 'bg-amber-50'
                        : 'bg-emerald-50'
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <MessageSquare className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">{t('noRecentActivity')}</p>
              <Link href="/chat" className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                {t('startChat')}
              </Link>
            </div>
          )}
        </div>

        {/* Upcoming */}
        <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-5 text-lg font-bold text-slate-900">{t('upcoming')}</h2>

          {offersQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-xl bg-slate-50 p-4">
                  <div className="h-3 bg-slate-200 rounded w-40 mb-2" />
                  <div className="h-2.5 bg-slate-200 rounded w-24" />
                </div>
              ))}
            </div>
          ) : upcomingOffers.length > 0 ? (
            <div className="space-y-3">
              {upcomingOffers.map((offer, idx) => {
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                );
                return (
                  <UpcomingRow
                    key={offer.id}
                    title={offer.category}
                    subtitle={daysLeft === 0 ? 'היום' : `עוד ${daysLeft} ימים`}
                    action={t('view')}
                    actionHref={`/offers/${offer.id}`}
                    highlighted={idx === 0}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <CalendarClock className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">{t('noUpcoming')}</p>
              <Link href="/offers" className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700">
                {t('browseOffers')}
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* Popular Offers */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t('popularOffers')}</h2>
          <Link href="/offers" className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            {t('viewAll')}
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </Link>
        </div>

        {offersQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                <div className="h-3 bg-slate-200 rounded w-24 mb-4" />
                <div className="h-6 bg-slate-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : offersQuery.isError ? (
          <div role="alert" className="flex flex-col items-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-300 mb-2" />
            <p className="text-sm text-red-600 mb-2">{t('errorLoadingOffers')}</p>
            <button type="button" onClick={() => offersQuery.refetch()} className="text-xs text-red-500 underline">
              {t('retry')}
            </button>
          </div>
        ) : offers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {offers.map((offer) => (
              <PopularOfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 text-center">
            <Tag className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">{t('noActiveOffers')}</p>
            <Link href="/offers" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
              {t('browseOffers')}
              <ArrowLeft className="h-4 w-4 rtl-flip" />
            </Link>
          </div>
        )}
      </div>

    </div>
  );
}
