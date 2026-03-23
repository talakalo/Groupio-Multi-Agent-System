'use client';

import { Building2, Shield, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useUnwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

export default function AdminDashboardPage(props: PageParamsProps) {
  useUnwrapPageParams(props);
  const t = useTranslations('admin.dashboard');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/buildings-manager/dashboard"
          className="card p-6 hover:shadow-lg transition-all group border border-gray-100 hover:border-indigo-200"
        >
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-emerald-600" />
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">{t('buildingsManagerCard.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('buildingsManagerCard.description')}</p>
        </Link>

        <div className="card p-6 border border-gray-100 opacity-75">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Shield className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">{t('systemSettingsCard.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('systemSettingsCard.description')}</p>
        </div>
      </div>
    </div>
  );
}
