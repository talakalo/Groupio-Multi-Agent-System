'use client';

import { Building2, Copy, Check, Users, Tag, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';

import { cn } from '@/lib/utils/cn';

interface BuildingSummaryCardProps {
  buildingName: string;
  address: string;
  memberCount: number;
  inviteCode: string;
  activeOffersCount: number;
  className?: string;
}

export function BuildingSummaryCard({
  buildingName,
  address,
  memberCount,
  inviteCode,
  activeOffersCount,
  className,
}: BuildingSummaryCardProps) {
  const t = useTranslations('building');
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }, [inviteCode]);

  return (
    <div className={cn('card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-6 w-6 text-primary-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900 truncate">{buildingName}</h3>
          <p className="text-sm text-gray-500 truncate">{address}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className="flex items-center gap-1.5 text-gray-600">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-gray-900">{memberCount}</span>
          {t('residents')}
        </span>
        <span className="flex items-center gap-1.5 text-gray-600">
          <Tag className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-gray-900">{activeOffersCount}</span>
          {t('activeOffers')}
        </span>
      </div>

      {/* Invite code */}
      <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{t('inviteCode')}</p>
          <p className="font-mono text-sm font-bold text-gray-900 tracking-wider">{inviteCode}</p>
        </div>
        <button
          type="button"
          onClick={copyCode}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            copied
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('copied') : t('copyCode')}
        </button>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={copyCode}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors"
      >
        <UserPlus className="h-4 w-4" />
        {t('inviteNeighbors')}
      </button>
    </div>
  );
}
