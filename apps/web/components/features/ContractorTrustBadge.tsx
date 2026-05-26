'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TrustBadgeProps {
  verificationStatus: 'verified' | 'pending' | 'rejected';
  trustScore: number; // 0-100
  completedJobs: number;
  licenseNumber?: string;
}

export function ContractorTrustBadge({
  verificationStatus,
  trustScore,
  completedJobs,
  licenseNumber,
}: TrustBadgeProps) {
  const t = useTranslations('contractor.trust');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {verificationStatus === 'verified' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-green-100 text-green-800 border border-green-200">
          <ShieldCheck className="h-3 w-3" />
          {t('verified')}
        </span>
      )}
      {verificationStatus === 'pending' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
          {t('pending')}
        </span>
      )}
      {verificationStatus === 'rejected' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          {t('rejected')}
        </span>
      )}
      {trustScore >= 80 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
          {t('reliable')}
        </span>
      )}
      <span className="text-sm text-gray-500">{t('completedJobs', { count: completedJobs })}</span>
      {licenseNumber && (
        <span className="text-xs text-gray-400">{t('license', { number: licenseNumber })}</span>
      )}
    </div>
  );
}
