'use client';

import { CheckCircle2, Crown, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/lib/api/client';

interface MembershipState {
  membership_status: string | null;
  membership_plan: string | null;
  membership_provider: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'פעיל', color: 'text-green-700 bg-green-50 border-green-200' },
  trialing: { label: 'תקופת ניסיון', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  past_due: { label: 'תשלום באיחור', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  canceled: { label: 'מבוטל', color: 'text-gray-700 bg-gray-50 border-gray-200' },
  inactive: { label: 'לא פעיל', color: 'text-gray-700 bg-gray-50 border-gray-200' },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ContractorMembershipPage() {
  const [membership, setMembership] = useState<MembershipState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const fetchMembership = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getContractorMembership();
      setMembership(data);
    } catch {
      setError('לא ניתן לטעון את פרטי המנוי. נסו שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMembership();
  }, [fetchMembership]);

  const handleUpgrade = async () => {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const { url } = await apiClient.createMembershipCheckoutSession(
        `${window.location.origin}/contractor/membership?membership=success`,
        `${window.location.origin}/contractor/membership?membership=canceled`
      );
      window.location.href = url;
    } catch {
      setCheckoutError('לא ניתן לפתוח את דף התשלום. אנא נסו שוב.');
      setCheckingOut(false);
    }
  };

  const status = membership?.membership_status ?? 'inactive';
  const statusConfig = STATUS_LABELS[status] ?? STATUS_LABELS.inactive;
  const isActive = status === 'active' || status === 'trialing';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-red-50 rounded-xl p-6 flex items-center gap-3 text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Crown className="h-8 w-8 text-accent-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מנוי שוק</h1>
          <p className="text-sm text-gray-500">נהלו את מנוי הקבלן שלכם</p>
        </div>
      </div>

      {/* Current Status Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">סטטוס נוכחי</h2>

        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusConfig.color}`}>
            {isActive && <CheckCircle2 className="h-4 w-4 mr-1" />}
            {statusConfig.label}
          </span>
          {membership?.membership_plan && (
            <span className="text-sm text-gray-600">תוכנית: {membership.membership_plan}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          {membership?.current_period_end && (
            <div>
              <p className="text-gray-500">תוקף מנוי עד</p>
              <p className="font-medium text-gray-900">{formatDate(membership.current_period_end)}</p>
            </div>
          )}
          {membership?.next_billing_at && (
            <div>
              <p className="text-gray-500">חידוש הבא</p>
              <p className="font-medium text-gray-900">{formatDate(membership.next_billing_at)}</p>
            </div>
          )}
          {membership?.trial_ends_at && (
            <div>
              <p className="text-gray-500">ניסיון מסתיים</p>
              <p className="font-medium text-gray-900">{formatDate(membership.trial_ends_at)}</p>
            </div>
          )}
        </div>

        {membership?.cancel_at_period_end && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-sm">
            המנוי שלכם יבוטל בסוף התקופה הנוכחית ולא יחודש.
          </div>
        )}
      </div>

      {/* Upgrade / Plans */}
      {!isActive && (
        <div className="bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl border border-primary-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Crown className="h-5 w-5 text-accent-500" />
            שדרגו לחברות בשוק
          </h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              'הופעה בתוצאות החיפוש לדיירים',
              'יצירת הצעות מחיר ללא הגבלה',
              'גישה לכלים מתקדמים לניהול לקוחות',
              'תמיכה עדיפותית',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>

          {checkoutError && (
            <p className="text-sm text-red-600" role="alert">{checkoutError}</p>
          )}

          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={checkingOut}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent-500 text-white font-semibold hover:bg-accent-600 transition-colors disabled:opacity-60"
          >
            {checkingOut ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ExternalLink className="h-5 w-5" />
            )}
            {checkingOut ? 'מעביר לתשלום...' : 'שדרגו עכשיו'}
          </button>
        </div>
      )}

      {/* Already active — manage via Stripe */}
      {isActive && membership?.membership_provider === 'stripe' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">ניהול מנוי</h2>
          <p className="text-sm text-gray-600">
            לעדכון פרטי תשלום, ביטול המנוי, או צפייה בהיסטוריית חשבוניות — עברו לפורטל הלקוחות של Stripe.
          </p>
          <button
            type="button"
            onClick={() => void handleUpgrade()}
            disabled={checkingOut}
            className="flex items-center gap-2 text-sm text-primary-600 hover:underline disabled:opacity-60"
          >
            <ExternalLink className="h-4 w-4" />
            {checkingOut ? 'טוען...' : 'ניהול מנוי ב-Stripe'}
          </button>
          {checkoutError && (
            <p className="text-sm text-red-600" role="alert">{checkoutError}</p>
          )}
        </div>
      )}
    </div>
  );
}
