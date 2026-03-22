'use client';

import type { Building, Offer, Resident } from '@groupio/types';
import { formatPrice, formatDate } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Users,
  MapPin,
  Tag,
  ChevronLeft,
  UserCircle,
  Crown,
  Copy,
  Check,
  Share2,
  Settings,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EmptyState } from '@/components/shared/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BuildingProfile extends Building {
  residents: ResidentSummary[];
  activeOffers: Offer[];
  totalSavings: number;
  managedBy?: string;
  inviteCode: string;
}

interface ResidentSummary {
  id: string;
  name: string;
  apartmentNumber: string;
  joinedAt: string;
  isCommitteeMember: boolean;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ResidentRow({ resident }: { resident: ResidentSummary }) {
  const t = useTranslations('building');
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
        <UserCircle className="h-5 w-5 text-primary-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{resident.name}</p>
          {resident.isCommitteeMember && (
            <span className="badge-accent text-xs flex items-center gap-0.5">
              <Crown className="h-3 w-3" />
              {t('committee')}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {t('apartment')} {resident.apartmentNumber}
        </p>
      </div>
      <span className="text-xs text-gray-400">
        {formatDate(resident.joinedAt)}
      </span>
    </div>
  );
}

function GroupOfferCard({ offer }: { offer: Offer }) {
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');
  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;

  return (
    <Link href={`/offers/${offer.id}`} className="block p-4 rounded-xl border border-gray-100 hover:border-primary-200 transition-all">
      <div className="flex items-start justify-between mb-2">
        <span className="badge-primary text-xs">{tCat(offer.category)}</span>
        <ChevronLeft className="h-4 w-4 text-gray-300 rtl-flip" />
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg font-bold text-gray-900">
          {formatPrice(currentTier?.price ?? offer.basePrice)}
        </span>
        {discountPercent > 0 && (
          <span className="text-sm text-emerald-600 font-medium">
            {t('discount', { percent: discountPercent })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {offer.participants}
        </span>
        <span>{offer.contractor?.businessName}</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BuildingPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const t = useTranslations('building');
  const tCommon = useTranslations('common');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'neighbors' | 'offers' | 'settings'>('neighbors');

  const accessToken = useAuthStore((s) => s.accessToken);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const buildingQuery = useQuery<BuildingProfile | null>({
    queryKey: ['building', 'profile'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/buildings/me`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch building');
      }
      const data = await res.json();
      return {
        ...data,
        residents: data.residents ?? [],
        activeOffers: data.activeOffers ?? [],
        totalSavings: data.totalSavings ?? data.total_savings ?? 0,
        inviteCode: data.inviteCode ?? data.invite_code ?? '',
      } as BuildingProfile;
    },
    enabled: !!accessToken,
  });

  const building = buildingQuery.data;

  const handleCopyCode = async () => {
    if (!building?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(building.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (!building?.inviteCode) return;
    const shareText = `הצטרפו לבניין שלנו ב-Groupio! קוד הזמנה: ${building.inviteCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'הזמנה ל-Groupio', text: shareText });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareText);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (!buildingQuery.isLoading && buildingQuery.data === null) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          icon={Building2}
          title={t('noBuilding') ?? 'אין בניין משויך'}
          description="הצטרפו לבניין שלכם כדי לראות שכנים והצעות קבוצתיות."
          action={{ label: 'הצטרפו לבניין', href: '/building/join' }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Building profile header */}
      <div className="card">
        {buildingQuery.isLoading ? (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <Skeleton variant="avatar" className="w-16 h-16 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="h-6 w-48" />
                <Skeleton variant="text" className="h-4 w-32" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Skeleton variant="stat" className="h-24" />
              <Skeleton variant="stat" className="h-24" />
              <Skeleton variant="stat" className="h-24" />
              <Skeleton variant="stat" className="h-24" />
            </div>
            <Skeleton variant="card" className="h-40" />
          </div>
        ) : building ? (
          <>
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-primary-100 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary-500" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-900">{building.address}</h1>
                <p className="text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin className="h-4 w-4" />
                  {building.city}
                </p>
              </div>
              <Badge variant="primary" size="sm">
                {building.residents?.length ?? 0} דיירים
              </Badge>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">{building.units}</p>
                <p className="text-xs text-gray-500">{t('totalUnits')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">{building.residents?.length ?? 0}</p>
                <p className="text-xs text-gray-500">{t('activeResidents')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Tag className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-lg font-bold text-gray-900">{building.activeOffers?.length ?? 0}</p>
                <p className="text-xs text-gray-500">{t('activeOffers')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-lg font-bold text-emerald-600">{formatPrice(building.totalSavings ?? 0)}</p>
                <p className="text-xs text-gray-500">{t('totalSavings')}</p>
              </div>
            </div>

            {/* Invite code — prominent */}
            <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-xl border border-primary-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-primary-500" />
                <h3 className="font-semibold text-primary-800">{t('inviteCode')}</h3>
              </div>
              <div className="bg-white rounded-lg border border-primary-200 p-4 flex items-center justify-between mb-4">
                <p className="text-2xl font-bold text-primary-600 font-mono tracking-widest select-all">
                  {building.inviteCode}
                </p>
                <Badge variant="primary" size="sm">קוד הזמנה</Badge>
              </div>
              <p className="text-sm text-primary-700 mb-4">
                שתפו את הקוד עם שכנים כדי שיוכלו להצטרף לבניין ולקבל הצעות קבוצתיות
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                    copiedCode
                      ? 'bg-emerald-500 text-white'
                      : 'bg-primary-500 text-white hover:bg-primary-600'
                  )}
                >
                  {copiedCode ? (
                    <>
                      <Check className="h-4 w-4" />
                      {t('copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {t('copyCode')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-primary-300 text-primary-700 hover:bg-primary-50 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  {t('share') ?? 'שתף'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(
          [
            { key: 'neighbors', icon: Users, label: t('neighbors') },
            { key: 'offers', icon: Tag, label: t('groupOffers') },
            { key: 'settings', icon: Settings, label: t('buildingSettings') },
          ] as const
        ).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'neighbors' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {t('neighbors')} ({building?.residents?.length ?? 0})
          </h2>
          {buildingQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-3 py-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-32 mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : building?.residents && building.residents.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {building.residents.map((resident) => (
                <ResidentRow key={resident.id} resident={resident} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500">{t('noNeighbors')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('inviteNeighbors')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'offers' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t('groupOffers')}</h2>
            <Link
              href="/offers"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {t('viewAll')}
            </Link>
          </div>
          {building?.activeOffers && building.activeOffers.length > 0 ? (
            <div className="space-y-3">
              {building.activeOffers.map((offer: Offer) => (
                <GroupOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Tag}
              title={t('noGroupOffers')}
              description="הצעות קבוצתיות בבניין יופיעו כאן. שתפו את קוד ההזמנה עם שכנים."
              action={{ label: t('viewAll'), href: '/offers' }}
            />
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('buildingSettings')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('buildingAddress')}
              </label>
              <input
                type="text"
                value={building?.address ?? ''}
                readOnly
                className="input-field bg-gray-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('city')}
                </label>
                <input
                  type="text"
                  value={building?.city ?? ''}
                  readOnly
                  className="input-field bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('totalUnits')}
                </label>
                <input
                  type="text"
                  value={String(building?.units ?? 0)}
                  readOnly
                  className="input-field bg-gray-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('buildingAge')}
              </label>
              <input
                type="text"
                value={building?.age ? t('yearsOld', { years: building.age }) : '-'}
                readOnly
                className="input-field bg-gray-50"
              />
            </div>
            <p className="text-xs text-gray-400">{t('contactCommittee')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
