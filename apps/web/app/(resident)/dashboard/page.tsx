'use client';

import type { Offer } from '@groupio/types';
import { formatPrice } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Tag,
  Users,
  TrendingDown,
  ArrowLeft,
  Clock,
  Building2,
  AlertCircle,
  ChevronLeft,
  ShoppingBag,
  Package,
  Shield,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BuildingSummaryCard } from '@/components/features/building/BuildingSummaryCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  activeOffers: number;
  activeOrders: number;
  neighborsJoined: number;
  totalSavings: number;
  buildingName: string;
  buildingAddress: string;
  inviteCode: string;
}

interface DashboardOrder {
  id: string;
  offerId: string;
  offerTitle?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Clickable Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'card group hover:shadow-md transition-all',
        accent && 'bg-amber-50 border-amber-200'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className={cn('text-sm mb-1', accent ? 'text-amber-700' : 'text-gray-500')}>
            {label}
          </p>
          <p className={cn('text-2xl font-bold', accent ? 'text-amber-900' : 'text-gray-900')}>
            {value}
          </p>
        </div>
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            accent ? 'bg-amber-200' : 'bg-primary-100'
          )}
        >
          <Icon className={cn('h-6 w-6', accent ? 'text-amber-600' : 'text-primary-500')} />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs font-medium text-primary-600 group-hover:text-primary-700">
        <span>צפייה</span>
        <ChevronLeft className="h-3 w-3 rtl-flip" />
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Compact Offer Card
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
          <Badge variant="primary" size="sm">
            {tCat(offer.category)}
          </Badge>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg font-bold text-gray-900">
              {formatPrice(currentTier?.price ?? offer.basePrice)}
            </span>
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
// Order status config
// ---------------------------------------------------------------------------

const ORDER_STATUS: Record<string, { label: string; variant: 'warning' | 'info' | 'primary' | 'success' | 'error'; icon: React.ElementType }> = {
  pending: { label: 'ממתין', variant: 'warning', icon: Clock },
  processing: { label: 'בעיבוד', variant: 'info', icon: RefreshCw },
  succeeded: { label: 'בנאמנות', variant: 'primary', icon: Shield },
  released: { label: 'הושלם', variant: 'success', icon: CheckCircle2 },
  failed: { label: 'נכשל', variant: 'error', icon: XCircle },
  refunded: { label: 'הוחזר', variant: 'accent', icon: RefreshCw },
};

// ---------------------------------------------------------------------------
// Order row (compact)
// ---------------------------------------------------------------------------

function OrderRow({ order }: { order: DashboardOrder }) {
  const config = ORDER_STATUS[order.status] ?? ORDER_STATUS.pending;
  const StatusIcon = config.icon;

  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
        <Package className="h-5 w-5 text-primary-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {order.offerTitle || `הצעה #${order.offerId.slice(0, 8)}`}
        </p>
        <p className="text-xs text-gray-400">
          {new Date(order.createdAt).toLocaleDateString('he-IL')}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge variant={config.variant} size="sm">
          <StatusIcon className="h-3 w-3 me-1" />
          {config.label}
        </Badge>
        <span className="text-sm font-bold text-gray-900" dir="ltr">
          {new Intl.NumberFormat('he-IL', { style: 'currency', currency: order.currency || 'ILS', minimumFractionDigits: 0 }).format(order.amount)}
        </span>
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
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Fetch dashboard stats
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['resident', 'dashboard', 'stats'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/buildings/me`, { headers });
      if (!res.ok) {
        return {
          activeOffers: 0,
          activeOrders: 0,
          neighborsJoined: 0,
          totalSavings: 0,
          buildingName: '-',
          buildingAddress: '',
          inviteCode: '',
        };
      }
      const data = await res.json();
      return {
        activeOffers: data.activeOffers?.length ?? data.active_offers_count ?? 0,
        activeOrders: data.activeOrders?.length ?? data.active_orders_count ?? 0,
        neighborsJoined: data.residents?.length ?? data.member_count ?? 0,
        totalSavings: data.totalSavings ?? data.total_savings ?? 0,
        buildingName: data.name ?? data.address ?? '-',
        buildingAddress: data.address ?? '',
        inviteCode: data.inviteCode ?? data.invite_code ?? '',
      };
    },
    enabled: !!accessToken,
  });

  // Fetch recommended offers
  const offersQuery = useQuery<{ items: Offer[] }>({
    queryKey: ['resident', 'offers', 'recommended'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/offers?status=active&page_size=3`, { headers });
      if (!res.ok) throw new Error('Failed to fetch offers');
      return res.json();
    },
    enabled: !!accessToken,
  });

  // Fetch active orders
  const ordersQuery = useQuery<DashboardOrder[]>({
    queryKey: ['resident', 'orders', 'active'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/payments?status=active&page_size=5`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.items ?? data.payments ?? [];
    },
    enabled: !!accessToken,
  });

  const stats = statsQuery.data;
  const offers = offersQuery.data?.items ?? [];
  const orders = ordersQuery.data ?? [];
  const hasBuilding = stats?.buildingName !== '-';

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Personalized greeting */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          שלום, {userName || t('guestName')}! 👋
        </h1>
        {hasBuilding && (
          <p className="text-gray-500 mt-1">
            {stats?.buildingName} · {t('dashboardSubtitle')}
          </p>
        )}
        {!hasBuilding && (
          <p className="text-gray-500 mt-1">{t('dashboardSubtitle')}</p>
        )}
      </div>

      {/* No building CTA */}
      {!hasBuilding && !statsQuery.isLoading && (
        <EmptyState
          icon={Building2}
          title="ברוכים הבאים ל-Groupio!"
          description="עדיין לא הצטרפתם לבניין. הצטרפו לבניין שלכם כדי לגשת להצעות קבוצתיות."
          action={{ label: 'הצטרפו לבניין', href: '/building/join' }}
        />
      )}

      {/* Stats grid */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton variant="stat" />
          <Skeleton variant="stat" />
          <Skeleton variant="stat" />
          <Skeleton variant="stat" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={TrendingDown}
            label="חיסכון כולל"
            value={formatPrice(stats?.totalSavings ?? 0)}
            href="/payments"
            accent
          />
          <StatCard
            icon={Tag}
            label="הצעות פעילות"
            value={String(stats?.activeOffers ?? 0)}
            href="/offers"
          />
          <StatCard
            icon={ShoppingBag}
            label="הזמנות פעילות"
            value={String(stats?.activeOrders ?? 0)}
            href="/orders"
          />
          <StatCard
            icon={Users}
            label="דיירי הבניין"
            value={String(stats?.neighborsJoined ?? 0)}
            href="/building"
          />
        </div>
      )}

      {/* Building summary + Active orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Building summary card */}
        {hasBuilding && stats && (
          <BuildingSummaryCard
            buildingName={stats.buildingName}
            address={stats.buildingAddress}
            memberCount={stats.neighborsJoined}
            inviteCode={stats.inviteCode || 'N/A'}
            activeOffersCount={stats.activeOffers}
          />
        )}

        {/* Active orders */}
        <div className={cn(hasBuilding ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">הזמנות פעילות</h2>
            <Link
              href="/orders"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
            >
              הכל
              <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
            </Link>
          </div>

          {ordersQuery.isLoading ? (
            <Skeleton variant="card" count={2} />
          ) : orders.length > 0 ? (
            <div className="card p-0 divide-y divide-gray-50">
              {orders.slice(0, 5).map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-10">
              <ShoppingBag className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">אין הזמנות פעילות</p>
              <Link href="/offers" className="text-sm text-primary-600 font-medium mt-2 inline-block">
                גלו הצעות →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recommended offers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">הצעות מומלצות</h2>
          <Link
            href="/offers"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            ראו הכל
            <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
          </Link>
        </div>

        {offersQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
    </div>
  );
}
