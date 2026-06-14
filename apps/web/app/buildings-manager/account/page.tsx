'use client';

import { LogOut, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { useAuthStore } from '@/lib/stores/authStore';

export default function BuildingsManagerAccountPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('buildingsManager.account');

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* noop */
    }
    router.push('/login');
  }

  return (
    <div className="max-w-xl mx-auto" dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <UserCircle className="h-8 w-8 text-emerald-600" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-gray-500">{t('name')}</dt>
            <dd className="font-medium text-gray-900">{user?.fullName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('email')}</dt>
            <dd className="font-medium text-gray-900 break-all">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('role')}</dt>
            <dd className="font-medium text-gray-900">{user?.role ?? '—'}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/buildings-manager/dashboard"
            className="text-sm text-emerald-600 hover:underline font-medium"
          >
            {t('backToDashboard')}
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {t('signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
