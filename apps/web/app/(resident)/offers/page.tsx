'use client';

import type { Offer, ServiceCategory, OfferStatus } from '@groupio/types';
import { formatPrice } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Users,
  Clock,
  Tag,
  ChevronLeft,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OffersFilters {
  search: string;
  category: ServiceCategory | 'all';
  status: OfferStatus | 'all';
  priceMin: number | null;
  priceMax: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: { value: ServiceCategory | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'allCategories' },
  { value: 'ac_installation', labelKey: 'ac_installation' },
  { value: 'ac_maintenance', labelKey: 'ac_maintenance' },
  { value: 'kitchen', labelKey: 'kitchen' },
  { value: 'electrical', labelKey: 'electrical' },
  { value: 'plumbing', labelKey: 'plumbing' },
  { value: 'heating', labelKey: 'heating' },
  { value: 'renovations', labelKey: 'renovations' },
  { value: 'painting', labelKey: 'painting' },
  { value: 'flooring', labelKey: 'flooring' },
  { value: 'windows', labelKey: 'windows' },
];

const STATUS_OPTIONS: { value: OfferStatus | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'active', labelKey: 'active' },
  { value: 'pending', labelKey: 'pending' },
  { value: 'completed', labelKey: 'completed' },
  { value: 'expired', labelKey: 'expired' },
];

const STATUS_COLORS: Record<OfferStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-primary-100 text-primary-700',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

// ---------------------------------------------------------------------------
// Offer Card
// ---------------------------------------------------------------------------

function OfferCard({ offer }: { offer: Offer }) {
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Link href={`/offers/${offer.id}`} className="card group hover:border-primary-200 block">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="badge-primary text-xs">{tCat(offer.category)}</span>
          <span className={cn('badge text-xs', STATUS_COLORS[offer.status])}>
            {t(offer.status)}
          </span>
        </div>
        <ChevronLeft className="h-5 w-5 text-gray-300 group-hover:text-primary-500 transition-colors rtl-flip" />
      </div>

      {/* Contractor info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500">
          {offer.contractor?.businessName?.charAt(0) ?? '?'}
        </div>
        <div>
          <p className="font-medium text-gray-900 text-sm">{offer.contractor?.businessName}</p>
          {offer.contractor?.verified && (
            <span className="text-xs text-emerald-600 font-medium">{t('verifiedContractor')}</span>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xl font-bold text-gray-900">
          {formatPrice(currentTier?.price ?? offer.basePrice)}
        </span>
        {discountPercent > 0 && (
          <>
            <span className="text-sm text-gray-400 line-through">{formatPrice(offer.basePrice)}</span>
            <span className="badge-success text-xs">
              {t('discount', { percent: discountPercent })}
            </span>
          </>
        )}
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {t('participants', { count: offer.participants })}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {t('expiresIn', { days: daysLeft })}
        </span>
      </div>

      {/* Tier progress */}
      {offer.tiers.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{t('pricingTiers')}</span>
            <span>
              {offer.currentTier + 1}/{offer.tiers.length}
            </span>
          </div>
          <div className="flex gap-1">
            {offer.tiers.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  idx <= offer.currentTier ? 'bg-primary-500' : 'bg-gray-200'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function OffersListPage() {
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');
  const tCommon = useTranslations('common');

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<OffersFilters>({
    search: '',
    category: 'all',
    status: 'all',
    priceMin: null,
    priceMax: null,
  });

  const accessToken = typeof window !== 'undefined'
    ? (window as unknown as { __auth_store?: { getState: () => { accessToken: string | null } } }).__auth_store?.getState()?.accessToken
      ?? localStorage.getItem('auth_token')
    : null;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const offersQuery = useQuery<{ items: Offer[]; total: number }>({
    queryKey: ['resident', 'offers', filters.category, filters.status],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.category !== 'all') params.category = filters.category;
      if (filters.status !== 'all') params.status = filters.status;
      const searchParams = new URLSearchParams(params);
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${apiBase}/api/v1/offers?${searchParams.toString()}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch offers');
      return res.json();
    },
  });

  const filteredOffers = useMemo(() => {
    let results = offersQuery.data?.items ?? [];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (o: Offer) =>
          o.contractor?.businessName?.toLowerCase().includes(q) ||
          o.category.toLowerCase().includes(q)
      );
    }
    if (filters.priceMin !== null) {
      results = results.filter((o: Offer) => {
        const price = o.tiers[o.currentTier]?.price ?? o.basePrice;
        return price >= (filters.priceMin ?? 0);
      });
    }
    if (filters.priceMax !== null) {
      results = results.filter((o: Offer) => {
        const price = o.tiers[o.currentTier]?.price ?? o.basePrice;
        return price <= (filters.priceMax ?? Infinity);
      });
    }

    return results;
  }, [offersQuery.data, filters.search, filters.priceMin, filters.priceMax]);

  const activeFilterCount = [
    filters.category !== 'all',
    filters.status !== 'all',
    filters.priceMin !== null,
    filters.priceMax !== null,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilters({ search: '', category: 'all', status: 'all', priceMin: null, priceMax: null });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {t('offersCount', { count: filteredOffers.length })}
          </p>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute top-3 end-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder={tCommon('search')}
            className="input-field pe-11"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors font-medium text-sm',
            showFilters
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-200 text-gray-600 hover:border-gray-300'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{tCommon('filter')}</span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">{t('filterOffers')}</h3>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                {t('clearFilters')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Category filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('category')}
              </label>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    category: e.target.value as ServiceCategory | 'all',
                  }))
                }
                className="input-field"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 'all' ? t('allCategories') : tCat(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('status')}
              </label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: e.target.value as OfferStatus | 'all',
                  }))
                }
                className="input-field"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 'all' ? t('allStatuses') : t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Price range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('priceMin')}
              </label>
              <input
                type="number"
                min={0}
                value={filters.priceMin ?? ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    priceMin: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="0"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('priceMax')}
              </label>
              <input
                type="number"
                min={0}
                value={filters.priceMax ?? ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    priceMax: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder={t('noLimit')}
                className="input-field"
              />
            </div>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                status: opt.value as OfferStatus | 'all',
              }))
            }
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              filters.status === opt.value
                ? 'bg-primary-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            {opt.value === 'all' ? t('allStatuses') : t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* Offers grid */}
      {offersQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-2 mb-3">
                <div className="h-5 bg-gray-200 rounded-full w-20" />
                <div className="h-5 bg-gray-200 rounded-full w-16" />
              </div>
              <div className="h-6 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-48" />
            </div>
          ))}
        </div>
      ) : filteredOffers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOffers.map((offer: Offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <Tag className="h-16 w-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium mb-2">{t('noOffers')}</p>
          <p className="text-gray-400 text-sm mb-6">{t('noOffersDescription')}</p>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="btn-secondary inline-flex items-center gap-2">
              <X className="h-4 w-4" />
              <span>{t('clearFilters')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
