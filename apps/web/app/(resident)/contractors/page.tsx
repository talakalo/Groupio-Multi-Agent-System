'use client';

import type { Contractor, ServiceCategory, Region, ContractorMatch } from '@groupio/types';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Star,
  Shield,
  Phone,
  MapPin,
  Briefcase,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';

import { ContractorTrustBadge } from '@/components/features/ContractorTrustBadge';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractorWithScore extends Contractor {
  trustScore?: number;
  matchScore?: number;
  completedJobs?: number;
  // licenseNumber is inherited as required from Contractor
}

interface ContractorFilters {
  search: string;
  category: ServiceCategory | 'all';
  region: Region | 'all';
  minRating: number;
  verifiedOnly: boolean;
  sortBy: 'rating' | 'trust' | 'experience';
}

// ---------------------------------------------------------------------------
// Trust Score Badge
// ---------------------------------------------------------------------------

function TrustScoreBadge({ score }: { score: number }) {
  const t = useTranslations('contractors');
  const level =
    score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'new';
  const colorMap = {
    excellent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    good: 'bg-primary-100 text-primary-700 border-primary-200',
    fair: 'bg-amber-100 text-amber-700 border-amber-200',
    new: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border', colorMap[level])}>
      <Shield className="h-3 w-3" />
      {t('trustScore')}: {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Star Rating Display
// ---------------------------------------------------------------------------

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            sizeClass,
            star <= Math.round(rating)
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-200'
          )}
        />
      ))}
      <span className={cn('font-medium text-gray-700 ms-1', size === 'md' ? 'text-base' : 'text-sm')}>
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contractor Card
// ---------------------------------------------------------------------------

function ContractorCard({ contractor }: { contractor: ContractorWithScore }) {
  const t = useTranslations('contractors');
  const tCat = useTranslations('categories');
  const tRegions = useTranslations('regions');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary-100 flex items-center justify-center text-xl font-bold text-primary-600">
          {contractor.avatar ? (
            <img
              src={contractor.avatar}
              alt={contractor.businessName}
              className="w-full h-full rounded-xl object-cover"
            />
          ) : (
            contractor.businessName?.charAt(0) ?? '?'
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-lg">{contractor.businessName}</h3>
            {contractor.verified && (
              <span className="badge-success text-xs">
                <Shield className="h-3 w-3 me-1" />
                {t('verified')}
              </span>
            )}
          </div>

          <div className="mt-1">
            <StarRating rating={contractor.rating} />
          </div>

          {/* Trust score */}
          <div className="mt-2">
            <ContractorTrustBadge
              verificationStatus={contractor.verified ? 'verified' : 'pending'}
              trustScore={contractor.trustScore ?? 0}
              completedJobs={contractor.completedJobs ?? 0}
              licenseNumber={contractor.licenseNumber}
            />
          </div>

          {/* Specialties */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {contractor.categories?.map((cat) => (
              <span key={cat} className="badge-primary text-xs">
                {tCat(cat)}
              </span>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            {contractor.yearsInBusiness && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {t('experience', { years: contractor.yearsInBusiness })}
              </span>
            )}
            {contractor.regions && contractor.regions.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {contractor.regions.slice(0, 2).map((r) => tRegions(r)).join(', ')}
                {contractor.regions.length > 2 && ` +${contractor.regions.length - 2}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable description */}
      {contractor.description && (
        <div className="mt-4">
          <p className={cn('text-sm text-gray-600 leading-relaxed', !expanded && 'line-clamp-2')}>
            {contractor.description}
          </p>
          {contractor.description.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium mt-1 flex items-center gap-1"
            >
              {expanded ? (
                <>
                  {t('showLess')}
                  <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  {t('showMore')}
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-50">
        {contractor.phone && (
          <a
            href={`tel:${contractor.phone}`}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
          >
            <Phone className="h-4 w-4" />
            <span>{t('contactContractor')}</span>
          </a>
        )}
        <button
          type="button"
          className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
        >
          <span>{t('viewProfile')}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContractorsPage() {
  const t = useTranslations('contractors');
  const tCat = useTranslations('categories');
  const tRegions = useTranslations('regions');
  const tCommon = useTranslations('common');

  const [filters, setFilters] = useState<ContractorFilters>({
    search: '',
    category: 'all',
    region: 'all',
    minRating: 0,
    verifiedOnly: false,
    sortBy: 'rating',
  });

  const [showFilters, setShowFilters] = useState(false);

  const contractorsQuery = useQuery<{ items: ContractorWithScore[]; total: number }>({
    queryKey: ['contractors', filters.category, filters.region],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.category !== 'all') params.category = filters.category;
      if (filters.region !== 'all') params.region = filters.region;
      return apiClient.getContractors(params);
    },
  });

  const sortedContractors = useMemo(() => {
    let results = contractorsQuery.data?.items ?? [];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        (c) =>
          c.businessName?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q)
      );
    }

    if (filters.verifiedOnly) {
      results = results.filter((c) => c.verified);
    }

    if (filters.minRating > 0) {
      results = results.filter((c) => c.rating >= filters.minRating);
    }

    results = [...results].sort((a, b) => {
      switch (filters.sortBy) {
        case 'trust':
          return (b.trustScore ?? 0) - (a.trustScore ?? 0);
        case 'experience':
          return (b.yearsInBusiness ?? 0) - (a.yearsInBusiness ?? 0);
        case 'rating':
        default:
          return b.rating - a.rating;
      }
    });

    return results;
  }, [contractorsQuery.data, filters]);

  const categories: ServiceCategory[] = [
    'ac_installation', 'ac_maintenance', 'kitchen', 'electrical',
    'plumbing', 'heating', 'renovations', 'painting', 'flooring', 'windows',
  ];

  const regions: Region[] = [
    'center', 'tel_aviv', 'jerusalem', 'haifa', 'north', 'south', 'sharon', 'shfela',
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {t('contractorsCount', { count: sortedContractors.length })}
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute top-3 end-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder={t('searchContractors')}
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
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card mb-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('specialty')}
              </label>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, category: e.target.value as ServiceCategory | 'all' }))
                }
                className="input-field"
              >
                <option value="all">{t('allSpecialties')}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {tCat(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('serviceArea')}
              </label>
              <select
                value={filters.region}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, region: e.target.value as Region | 'all' }))
                }
                className="input-field"
              >
                <option value="all">{t('allRegions')}</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {tRegions(r)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('minimumRating')}
              </label>
              <select
                value={filters.minRating}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, minRating: Number(e.target.value) }))
                }
                className="input-field"
              >
                <option value={0}>{t('anyRating')}</option>
                <option value={3}>3+ {t('stars')}</option>
                <option value={4}>4+ {t('stars')}</option>
                <option value={4.5}>4.5+ {t('stars')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('sortBy')}
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, sortBy: e.target.value as ContractorFilters['sortBy'] }))
                }
                className="input-field"
              >
                <option value="rating">{t('sortByRating')}</option>
                <option value="trust">{t('sortByTrust')}</option>
                <option value="experience">{t('sortByExperience')}</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.verifiedOnly}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, verifiedOnly: e.target.checked }))
                }
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">{t('verifiedOnly')}</span>
            </label>
          </div>
        </div>
      )}

      {/* Category chips */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, category: 'all' }))}
          className={cn(
            'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
            filters.category === 'all'
              ? 'bg-primary-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          )}
        >
          {t('allSpecialties')}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, category: cat }))}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              filters.category === cat
                ? 'bg-primary-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            {tCat(cat)}
          </button>
        ))}
      </div>

      {/* Results */}
      {contractorsQuery.isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex gap-4">
                <div className="w-14 h-14 bg-gray-200 rounded-xl" />
                <div className="flex-1">
                  <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
                  <div className="flex gap-2">
                    <div className="h-5 bg-gray-200 rounded-full w-16" />
                    <div className="h-5 bg-gray-200 rounded-full w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sortedContractors.length > 0 ? (
        <div className="space-y-4">
          {sortedContractors.map((contractor) => (
            <ContractorCard key={contractor.id} contractor={contractor} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <Search className="h-16 w-16 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium mb-2">{t('noContractors')}</p>
          <p className="text-gray-400 text-sm">{t('noContractorsDescription')}</p>
        </div>
      )}
    </div>
  );
}
