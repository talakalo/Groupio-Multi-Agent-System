'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/lib/api/client';

type EarningsPayload = Awaited<ReturnType<typeof apiClient.getContractorEarnings>>;

function fmtIls(n: number, currency: string) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: currency || 'ILS',
    minimumFractionDigits: 2,
  }).format(n);
}

export default function ContractorEarningsPage() {
  const t = useTranslations('contractorEarnings');
  const [data, setData] = useState<EarningsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getContractorEarnings();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 py-12 justify-center">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span className="text-sm">{t('loading')}</span>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-red-900"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 text-sm">
            <p>{error}</p>
            <button type="button" onClick={() => void load()} className="mt-2 text-sm font-medium underline">
              {t('retry')}
            </button>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('pending')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1" dir="ltr">
                {fmtIls(data.pending_total, data.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('completed')}</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1" dir="ltr">
                {fmtIls(data.completed_total, data.currency)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('heldEscrow')}</p>
              <p className="text-2xl font-bold text-amber-800 mt-1" dir="ltr">
                {fmtIls(data.held_escrow_total, data.currency)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">{t('recent')}</h2>
            </div>
            {data.recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">{t('empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-start font-medium px-4 py-2">{t('offer')}</th>
                      <th className="text-start font-medium px-4 py-2">{t('status')}</th>
                      <th className="text-start font-medium px-4 py-2">{t('type')}</th>
                      <th className="text-end font-medium px-4 py-2">{t('amount')}</th>
                      <th className="text-start font-medium px-4 py-2">{t('paidAt')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.recent.map((row) => (
                      <tr key={row.invoice_id} className="hover:bg-gray-50/80">
                        <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                          {row.offer_id}
                        </td>
                        <td className="px-4 py-2">{row.status}</td>
                        <td className="px-4 py-2">{row.payment_type}</td>
                        <td className="px-4 py-2 text-end font-medium" dir="ltr">
                          {fmtIls(row.total, row.currency)}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500" dir="ltr">
                          {row.paid_at ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
