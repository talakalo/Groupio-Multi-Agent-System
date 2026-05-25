'use client';

import type { Offer, ServiceCategory, OfferStatus } from '@groupio/types';
import { formatPrice } from '@groupio/utils';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Clock, Tag, ChevronLeft, SlidersHorizontal, X, AlertCircle, Star, ArrowUpDown } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';

import { CategoryChips } from '@/components/shared/CategoryChips';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { useUnwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

type SortOption = 'popularity' | 'new' | 'savings' | 'price';

interface OffersFilters {
  search: string;
  category: string;
  status: OfferStatus | 'all';
  priceMin: number | null;
  priceMax: number | null;
}

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
  in_progress: 'bg-sky-100 text-sky-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
};

const QUICK_CATEGORY_IDS = ['all', 'renovations', 'plumbing', 'electrical', 'ac_installation', 'painting', 'flooring', 'windows', 'heating'] as const;
const SORT_OPTION_VALUES: SortOption[] = ['popularity', 'new', 'savings', 'price'];

// ---------------------------------------------------------------------------
// Offer Card — new design language
// ---------------------------------------------------------------------------

function OfferCard({ offer }: { offer: Offer }) {
  const t = useTranslations('offers');
  const tCat = useTranslations('categories');

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? Math.round(currentTier.discount * 100) : 0;
  const daysLeft = Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <Link href={'/offers/' + offer.id} className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 hover:ring-emerald-200 hover:shadow-md transition-all block" data-testid="offer-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_COLORS[offer.status])}>{t(offer.status)}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{tCat(offer.category)}</span>
        </div>
        <ChevronLeft className="h-5 w-5 text-slate-300 group-hover:text-emerald-500 transition-colors rtl-flip flex-shrink-0" />
      </div>

      {/* Contractor info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0">
          {offer.contractor?.businessName?.charAt(0) ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">{offer.contractor?.businessName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {offer.contractor?.verified && <span className="text-xs text-emerald-600 font-medium">{t('verifiedContractor')}</span>}
            {offer.contractor?.rating != null && offer.contractor.rating > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
                <Star className="h-3 w-3 fill-amber-400 stroke-amber-500" />{offer.contractor.rating.toFixed(1)}
              </span>
            )}
            {offer.contractor?.trustScore != null && offer.contractor.trustScore >= 80 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                ✓ {offer.contractor.trustScore}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xl font-bold text-slate-900">{formatPrice(currentTier?.price ?? offer.basePrice)}</span>
        {discountPercent > 0 && (
          <>
            <span className="text-sm text-slate-400 line-through">{formatPrice(offer.basePrice)}</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{t('discount', { percent: discountPercent })}</span>
          </>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t('participants', { count: offer.participants })}</span>
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t('expiresIn', { days: daysLeft })}</span>
      </div>

      {/* Tier progress */}
      {offer.tiers.length > 1 && (
        <div className="mt-3 pt-3 border-t border-slate-50">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{t('pricingTiers')}</span>
            <span>{offer.currentTier + 1}/{offer.tiers.length}</span>
          </div>
          <div className="flex gap-1">
            {offer.tiers.map((_, idx) => (
              <div key={idx} className={cn('h-1.5 flex-1 rounded-full', idx <= offer.currentTier ? 'bg-emerald-500' : 'bg-slate-100')} />
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}

export default function OffersListPage(props: PageParamsProps) {
  useUnwrapPageParams(props);
  const t = useTranslations("offers");
  const tCat = useTranslations("categories");
  const tCommon = useTranslations("common");

  const QUICK_CATEGORIES = QUICK_CATEGORY_IDS.map((id) => ({
    id,
    label: id === 'all' ? t('quickAll') : tCat(id),
  }));
  const SORT_OPTIONS = SORT_OPTION_VALUES.map((value) => ({
    value,
    label: t(`sort.${value}`),
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("popularity");
  const [filters, setFilters] = useState<OffersFilters>({ search: "", category: "all", status: "all", priceMin: null, priceMax: null });
  const offersQuery = useQuery<{ items: Offer[]; total: number }>({
    queryKey: ["resident", "offers", filters.category, filters.status],
    queryFn: async () => {
      let buildingId = useAuthStore.getState().user?.buildingId;
      if (!buildingId) {
        try { const b = await apiClient.getMyBuilding(); buildingId = b.id; }
        catch (e) { if (e instanceof ApiError && e.status === 404) return { items: [], total: 0, page: 1, page_size: 20, has_more: false }; throw e; }
      }
      return apiClient.getOffers(buildingId, { category: filters.category !== "all" ? filters.category : undefined, status: filters.status !== "all" ? filters.status : undefined });
    },
  });
  const filteredOffers = useMemo(() => {
    let results = offersQuery.data?.items ?? [];
    if (filters.search.trim()) { const q = filters.search.toLowerCase(); results = results.filter((o: Offer) => o.contractor?.businessName?.toLowerCase().includes(q) || o.category.toLowerCase().includes(q)); }
    if (filters.priceMin !== null) results = results.filter((o: Offer) => { const price = o.tiers[o.currentTier]?.price ?? o.basePrice; return price >= (filters.priceMin ?? 0); });
    if (filters.priceMax !== null) results = results.filter((o: Offer) => { const price = o.tiers[o.currentTier]?.price ?? o.basePrice; return price <= (filters.priceMax ?? Infinity); });
    return [...results].sort((a, b) => { switch (sortBy) { case "popularity": return b.participants - a.participants; case "new": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); case "savings": { const dA = a.tiers[a.currentTier]?.discount ?? 0; const dB = b.tiers[b.currentTier]?.discount ?? 0; return dB - dA; } case "price": { const pA = a.tiers[a.currentTier]?.price ?? a.basePrice; const pB = b.tiers[b.currentTier]?.price ?? b.basePrice; return pA - pB; } default: return 0; } });
  }, [offersQuery.data, filters.search, filters.priceMin, filters.priceMax, sortBy]);

  const activeFilterCount = [filters.category !== "all", filters.status !== "all", filters.priceMin !== null, filters.priceMax !== null].filter(Boolean).length;
  const clearFilters = () => setFilters({ search: "", category: "all", status: "all", priceMin: null, priceMax: null });
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('offersCount', { count: filteredOffers.length })}</p>
        </div>
      </div>
      <CategoryChips categories={QUICK_CATEGORIES} selected={filters.category} onSelect={(id) => setFilters((prev) => ({ ...prev, category: id }))} className="mb-6" />
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute top-3 end-3 h-5 w-5 text-slate-400" />
          <input type="text" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} placeholder={tCommon('search')} className="input-field pe-11" />
        </div>
        <div className="relative">
          <ArrowUpDown className="absolute top-3 start-3 h-4 w-4 text-slate-400 pointer-events-none" />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className="appearance-none ps-9 pe-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 bg-white hover:border-slate-300 transition-colors cursor-pointer">
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setShowFilters((v) => !v)} className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors font-medium text-sm', showFilters ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
          <SlidersHorizontal className="h-4 w-4" /><span>{tCommon('filter')}</span>
          {activeFilterCount > 0 && <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">{activeFilterCount}</span>}
        </button>
      </div>
      {showFilters && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">{t('filterOffers')}</h3>
            {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">{t('clearFilters')}</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="filter-category" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('category')}</label>
              <select id="filter-category" value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))} className="input-field text-sm">
                {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.value === 'all' ? t('allCategories') : tCat(opt.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('status')}</label>
              <select id="filter-status" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as OfferStatus | 'all' }))} className="input-field text-sm">
                {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.value === 'all' ? t('allStatuses') : t(opt.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="filter-price-min" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('priceMin')}</label>
              <input id="filter-price-min" type="number" min={0} value={filters.priceMin ?? ''} onChange={(e) => setFilters((prev) => ({ ...prev, priceMin: e.target.value ? Number(e.target.value) : null }))} placeholder="0" className="input-field text-sm" />
            </div>
            <div>
              <label htmlFor="filter-price-max" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('priceMax')}</label>
              <input id="filter-price-max" type="number" min={0} value={filters.priceMax ?? ''} onChange={(e) => setFilters((prev) => ({ ...prev, priceMax: e.target.value ? Number(e.target.value) : null }))} placeholder={t('noLimit')} className="input-field text-sm" />
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((opt) => (
          <button key={opt.value} type="button" onClick={() => setFilters((prev) => ({ ...prev, status: opt.value as OfferStatus | 'all' }))} className={cn('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors', filters.status === opt.value ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300')}>
            {opt.value === 'all' ? t('allStatuses') : t(opt.labelKey)}
          </button>
        ))}
      </div>
      {offersQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="card" />)}</div>
      ) : offersQuery.isError ? (
        <div role="alert" className="rounded-2xl bg-red-50 ring-1 ring-red-200 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-300 mx-auto mb-3" />
          <p className="text-red-700 font-medium mb-2">{t('errorLoadingOffers')}</p>
          <button type="button" onClick={() => offersQuery.refetch()} className="mt-2 text-sm text-red-600 underline hover:text-red-800">{t('retry')}</button>
        </div>
      ) : filteredOffers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{filteredOffers.map((offer: Offer) => <OfferCard key={offer.id} offer={offer} />)}</div>
      ) : (
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-100">
          <EmptyState icon={Tag} title={t('noOffers')} description={activeFilterCount > 0 ? t('clearFilterHint') : t('noOffersDescription')} action={activeFilterCount > 0 ? undefined : { label: t('discoverOffers'), href: '/offers' }} />
          {activeFilterCount > 0 && (
            <div className="flex justify-center -mt-4 pb-4">
              <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 text-sm font-medium transition-colors">
                <X className="h-4 w-4" /><span>{t('clearFilters')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
