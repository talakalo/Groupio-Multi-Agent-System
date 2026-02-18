'use client';

import type { Offer, ServiceCategory } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import { OfferCard } from '@/components/features/offers/OfferCard';


type OfferStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed';

export default function ContractorActiveOffersPage() {
  const t = useTranslations('contractor.offers');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OfferStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'participants'>('date');

  useEffect(() => {
    async function fetchOffers() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (categoryFilter !== 'all') params.set('category', categoryFilter);
        params.set('sort', sortBy);

        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${apiBase}/api/v1/offers?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setOffers(data.items ?? data.offers ?? data);
        }
      } catch (error) {
        console.error('Failed to fetch offers:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchOffers();
  }, [statusFilter, categoryFilter, sortBy]);

  const statusOptions: { value: OfferStatus; label: string }[] = [
    { value: 'all', label: t('filters.allStatuses') },
    { value: 'pending', label: t('filters.pending') },
    { value: 'accepted', label: t('filters.accepted') },
    { value: 'in_progress', label: t('filters.inProgress') },
    { value: 'completed', label: t('filters.completed') },
  ];

  const categoryOptions: { value: ServiceCategory | 'all'; label: string }[] = [
    { value: 'all', label: t('filters.allCategories') },
    { value: 'ac_installation', label: t('categories.ac_installation') },
    { value: 'kitchen', label: t('categories.kitchen') },
    { value: 'electrical', label: t('categories.electrical') },
    { value: 'plumbing', label: t('categories.plumbing') },
    { value: 'painting', label: t('categories.painting') },
    { value: 'flooring', label: t('categories.flooring') },
    { value: 'windows', label: t('categories.windows') },
    { value: 'security', label: t('categories.security') },
  ];

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('active.title')}</h1>
        <p className="text-gray-600 mt-2">{t('active.subtitle')}</p>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('filters.status')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OfferStatus)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('filters.category')}
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ServiceCategory | 'all')}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('filters.sortBy')}
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'price' | 'participants')}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              <option value="date">{t('filters.sortByDate')}</option>
              <option value="price">{t('filters.sortByPrice')}</option>
              <option value="participants">{t('filters.sortByParticipants')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-600">
          {t('active.resultsCount', { count: offers.length })}
        </p>
        <a
          href="/contractor/offers/create"
          className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {t('active.createOffer')}
        </a>
      </div>

      {/* Offers List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">{t('active.empty.title')}</h3>
          <p className="text-gray-500 mb-4">{t('active.empty.description')}</p>
          <a
            href="/contractor/offers/create"
            className="inline-block bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {t('active.empty.cta')}
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer: Offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              variant="contractor"
              showActions
              showParticipants
            />
          ))}
        </div>
      )}
    </div>
  );
}
