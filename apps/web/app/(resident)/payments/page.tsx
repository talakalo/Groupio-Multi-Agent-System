'use client';

import Link from 'next/link';
import {
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Download,
  ArrowRight,
  Wallet,
  Shield,
  TrendingUp,
  Loader2,
  Info,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

// ---- Types (local until shared types propagate) ----

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'ממתין לתשלום', color: 'bg-amber-100 text-amber-800', icon: Clock },
  processing: { label: 'בעיבוד', color: 'bg-blue-100 text-blue-800', icon: RefreshCw },
  succeeded: { label: 'שולם', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  failed: { label: 'נכשל', color: 'bg-red-100 text-red-800', icon: XCircle },
  refunded: { label: 'הוחזר', color: 'bg-purple-100 text-purple-800', icon: RefreshCw },
};

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

function PaymentRow({ payment }: { payment: Payment }) {
  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50">
          <CreditCard className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900 text-sm">
            הצעה #{payment.offerId.slice(0, 8)}
          </p>
          <p className="text-xs text-gray-500">{formatDate(payment.createdAt)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {config.label}
        </span>
        <span className="font-semibold text-gray-900 min-w-[80px] text-left" dir="ltr">
          {formatCurrency(payment.amount, payment.currency)}
        </span>
        {payment.status === 'pending' && (
          <Link
            href={`/checkout?offer=${payment.offerId}`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 underline"
          >
            שלמו עכשיו
          </Link>
        )}
        {payment.status === 'succeeded' && (
          <Link
            href={`/orders/${payment.id}`}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 underline"
          >
            פרטי הזמנה
          </Link>
        )}
      </div>
    </div>
  );
}

function EscrowExplainer() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-6">
      <div className="flex items-start gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-100 flex-shrink-0">
          <Shield className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">התשלום שלך מוגן</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            כל התשלומים נשמרים בנאמנות (Escrow) על ידי Groupio.
            הכסף משוחרר לקבלן רק לאחר השלמת העבודה ואישור שלך.
            אם יש בעיה - אנחנו כאן לעזור עם תהליך החזר.
          </p>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              אתה משלם
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              Groupio שומר בנאמנות
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              קבלן מקבל אחרי השלמה
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'succeeded' | 'refunded'>('all');

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getMyPayments();
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('לא ניתן לטעון את התשלומים. נסה שוב.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

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
          <h1 className="text-2xl font-bold text-gray-900">התשלומים שלי</h1>
          <p className="text-sm text-gray-500 mt-1">
            ניהול תשלומים, חשבוניות וסטטוס נאמנות
          </p>
        </div>
        <button
          onClick={fetchPayments}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          רענון
        </button>
      </div>

      {/* Escrow Explainer */}
      <EscrowExplainer />

      {/* How to add payment method */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-900 mb-1">היכן מזינים פרטי תשלום?</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              פרטי כרטיס האשראי או אמצעי התשלום יוזנו בעת הצטרפות להצעה ובשלב אישור התשלום.
              גלשו ל{' '}
              <Link href="/offers" className="font-medium text-amber-900 underline hover:no-underline">
                ההצעות הפעילות
              </Link>
              , הצטרפו להצעה, ותתבקשו להזין את פרטי התשלום לפני השלמת התשלום.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="סה״כ שולם"
          value={formatCurrency(stats.totalPaid)}
          icon={Wallet}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          title="תשלומים ממתינים"
          value={String(stats.pendingPayments)}
          icon={Clock}
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          title="הצעות פעילות"
          value={String(stats.activeOffers)}
          icon={TrendingUp}
          color="bg-blue-100 text-blue-600"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all' as const, label: 'הכל' },
          { key: 'pending' as const, label: 'ממתינים' },
          { key: 'succeeded' as const, label: 'שולמו' },
          { key: 'refunded' as const, label: 'הוחזרו' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === tab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Payment list */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="mr-3 text-gray-500">טוען תשלומים...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-gray-600">{error}</p>
            <button
              onClick={fetchPayments}
              className="mt-3 text-indigo-600 text-sm font-medium hover:underline"
            >
              נסה שוב
            </button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">
              {filter === 'all'
                ? 'עדיין אין תשלומים'
                : 'אין תשלומים בקטגוריה זו'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              תשלומים יופיעו כאן כאשר תצטרף להצעה ותבצע תשלום
            </p>
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
