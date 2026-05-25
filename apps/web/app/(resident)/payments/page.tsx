'use client';

import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Wallet,
  TrendingUp,
  Info,
  Shield,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EscrowBadge } from '@/components/features/payments/EscrowBadge';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/lib/api/client';
import { useApiData } from '@/lib/hooks/useApiData';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

// ---- Types ----
// Local shape mirrors API until shared @groupio/types Payment aligns with /payments/my.

interface Payment {
  id: string;
  userId: string;
  offerId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  status: string;
  transactionId?: string;
  paymentMethod?: string;
  createdAt: string;
}

interface PaymentStats {
  totalPaid: number;
  pendingPayments: number;
  activeOffers: number;
}

// ---- Helpers ----

function formatCurrency(amount: number, currency = 'ILS'): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type BadgeVariant = "warning" | "info" | "success" | "error" | "accent";

// ---- Components ----

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

const STATUS_ICONS = { pending: Clock, processing: RefreshCw, succeeded: CheckCircle2, failed: XCircle, refunded: RefreshCw } as const;
const STATUS_VARIANTS: Record<string, BadgeVariant> = { pending: 'warning', processing: 'info', succeeded: 'success', failed: 'error', refunded: 'accent' };

function PaymentRow({ payment }: { payment: Payment }) {
  const t = useTranslations('payments');
  const status = payment.status in STATUS_ICONS ? payment.status : 'pending';
  const config = {
    label: t(`status.${status}`),
    variant: STATUS_VARIANTS[status] ?? 'warning',
    icon: STATUS_ICONS[status as keyof typeof STATUS_ICONS] ?? Clock,
    isEscrow: status === 'succeeded',
  };
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 shrink-0">
          <CreditCard className="w-5 h-5 text-primary-600" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">
            {t('offerLabel', { id: payment.offerId.slice(0, 8) })}
          </p>
          <p className="text-xs text-gray-500">{formatDate(payment.createdAt)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
        <div className="flex items-center gap-2">
          <Badge variant={config.variant} size="sm">
            <StatusIcon className="w-3 h-3 me-1" />
            {config.label}
          </Badge>
          {config.isEscrow && <EscrowBadge />}
        </div>
        <span className="font-semibold text-gray-900 min-w-[80px] text-left" dir="ltr">
          {formatCurrency(payment.amount, payment.currency)}
        </span>
        {payment.status === 'pending' && (
          <Link
            href={`/checkout?offerId=${payment.offerId}`}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 underline"
          >
            {t('payNow')}
          </Link>
        )}
        {payment.status === 'succeeded' && (
          <Link
            href={`/orders/${payment.id}`}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 underline"
          >
            {t('orderDetails')}
          </Link>
        )}
      </div>
    </div>
  );
}

function EscrowExplainer() {
  const t = useTranslations('payments');
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-primary-100 p-6">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 flex-shrink-0">
          <Shield className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">{t('yourPaymentProtected')}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {t('escrowDescription')}
          </p>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              {t('youPay')}
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              {t('groupioHolds')}
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              {t('contractorReceives')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function PaymentsPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const t = useTranslations('payments');
  const [filter, setFilter] = useState<'all' | 'pending' | 'succeeded' | 'refunded'>('all');

  // PERF-8: react-query via shared useApiData hook. Backend returns
  // `{ payments, total, page, pages }` after PERF-9; legacy-array shape kept
  // as a fallback during rollout.
  const {
    data: payments = [],
    isLoading: loading,
    error,
    refetch,
  } = useApiData<Payment[]>(
    ['payments', 'my', { page: 1, limit: 50 }],
    async () => {
      const data = await apiClient.getMyPayments({ page: 1, limit: 50 });
      return Array.isArray((data as unknown) as Payment[])
        ? ((data as unknown) as Payment[])
        : (data?.payments ?? []);
    },
  );
  const fetchPayments = () => { void refetch(); };

  const filteredPayments = payments.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return p.status === 'pending' || p.status === 'processing';
    return p.status === filter;
  });

  const stats: PaymentStats = {
    totalPaid: payments
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount, 0),
    pendingPayments: payments.filter(
      (p) => p.status === 'pending' || p.status === 'processing'
    ).length,
    activeOffers: new Set(payments.map((p) => p.offerId)).size,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={fetchPayments}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('refresh')}
        </button>
      </div>

      {/* Escrow Explainer */}
      <EscrowExplainer />

      {/* How to add payment method */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900 mb-1">{t('paymentInfoTitle')}</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              {t('paymentInfoDescription')}{' '}
              <Link href="/offers" className="font-medium text-amber-900 underline hover:no-underline">
                {t('activeOffers')}
              </Link>
              {t('joinAndPay')}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t('totalPaid')}
          value={formatCurrency(stats.totalPaid)}
          icon={Wallet}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          title={t('pendingPayments')}
          value={String(stats.pendingPayments)}
          icon={Clock}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          title={t('activeOffersCount')}
          value={String(stats.activeOffers)}
          icon={TrendingUp}
          color="bg-blue-100 text-blue-600"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all' as const, labelKey: 'filterAll' },
          { key: 'pending' as const, labelKey: 'filterPending' },
          { key: 'succeeded' as const, labelKey: 'filterSucceeded' },
          { key: 'refunded' as const, labelKey: 'filterRefunded' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Payment list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-5 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton variant="avatar" className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton variant="text" className="h-4 w-28" />
                    <Skeleton variant="text" className="h-3 w-20" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton variant="text" className="h-5 w-16 rounded-full" />
                  <Skeleton variant="text" className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-gray-600">{t('loadError')}</p>
            <button
              onClick={fetchPayments}
              className="mt-3 text-primary-600 text-sm font-medium hover:underline"
            >
              {t('retry')}
            </button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-700 font-semibold text-lg">
              {filter === 'all'
                ? t('noPayments')
                : t('noPaymentsInCategory')}
            </p>
            <p className="text-sm text-gray-400 mt-2 max-w-xs">
              {t('noPaymentsHint')}
            </p>
            <Link
              href="/offers"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
            >
              {t('discoverOffers')}
            </Link>
          </div>
        ) : (
          <div className="px-5">
            {filteredPayments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
