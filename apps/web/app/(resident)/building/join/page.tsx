'use client';

import { Building2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiClient, ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { useUnwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

export default function BuildingJoinPage(props: PageParamsProps) {
  useUnwrapPageParams(props);
  const t = useTranslations('building');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError(t('joinCodeRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.joinBuilding(code.trim());
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = (err.body as { detail?: string } | undefined)?.detail;
        setError(detail ?? t('joinErrorGeneric'));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('joinErrorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('joinSuccess')}</h1>
          <p className="text-gray-600">{t('joinSuccessSubtitle')}</p>
          <Link
            href="/building"
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
          >
            {t('joinGoToBuilding')}
            <ArrowRight className="h-4 w-4 rtl-flip" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('joinTitle')}</h1>
          <p className="text-gray-600">{t('joinSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('joinCodeLabel')}
            </label>
            <input
              id="invite-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('joinCodePlaceholder')}
              dir="ltr"
              aria-invalid={!!error}
              aria-describedby={error ? 'join-error' : undefined}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-center text-lg font-mono tracking-widest',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                error ? 'border-red-400' : 'border-gray-300',
              )}
            />
            {error && (
              <p id="join-error" role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className={cn(
              'w-full rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors',
              'bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
            )}
          >
            {loading ? t('joining') : t('joinSubmit')}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {t('joinNoCode')}{' '}
          <Link href="/building" className="text-primary-600 hover:underline font-medium">
            {t('joinBack')}
          </Link>
        </p>
      </div>
    </div>
  );
}
