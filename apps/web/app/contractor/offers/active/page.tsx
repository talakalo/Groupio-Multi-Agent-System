'use client';

import type { Offer, ServiceCategory } from '@groupio/types';
import { Users, BarChart2, DollarSign, ChevronDown, ChevronUp, Loader2, Mail, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

import { OfferCard } from '@/components/features/offers/OfferCard';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

// ---- Offer analytics + participants panel ----

interface Participant {
  id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  apartment_number?: string;
  units?: number;
  status?: string;
}

function OfferAnalyticsPanel({ offer }: { offer: Offer }) {
  const [expanded, setExpanded] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [participantError, setParticipantError] = useState(false);

  const revenue = (offer.basePrice ?? 0) * (offer.participants ?? 0);

  const fetchParticipants = useCallback(async () => {
    if (participants.length > 0) return; // already loaded
    setLoadingParts(true);
    setParticipantError(false);
    try {
      const res = await apiClient.getOfferParticipants(offer.id);
      setParticipants((res.items as Participant[]) ?? []);
    } catch {
      setParticipantError(true);
    } finally {
      setLoadingParts(false);
    }
  }, [offer.id, participants.length]);

  const handleToggle = () => {
    if (!expanded) fetchParticipants();
    setExpanded((v) => !v);
  };

  return (
    <div className="border-t border-gray-100 bg-gray-50 rounded-b-xl">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-6 px-5 py-3 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-sky-500" aria-hidden="true" />
          <strong>{offer.participants ?? 0}</strong> משתתפים
        </span>
        <span className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          הכנסה משוערת: <strong>₪{revenue.toLocaleString('he-IL')}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4 text-amber-500" aria-hidden="true" />
          מחיר בסיס: <strong>₪{(offer.basePrice ?? 0).toLocaleString('he-IL')}</strong>
        </span>
        <button
          type="button"
          onClick={handleToggle}
          className="ms-auto flex items-center gap-1 text-sky-600 hover:text-sky-700 font-medium text-sm"
          aria-expanded={expanded}
        >
          {expanded ? (
            <><ChevronUp className="w-4 h-4" aria-hidden="true" />הסתר משתתפים</>
          ) : (
            <><ChevronDown className="w-4 h-4" aria-hidden="true" />הצג משתתפים</>
          )}
        </button>
      </div>

      {/* Participant list */}
      {expanded && (
        <div className="px-5 pb-4">
          {loadingParts ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />טוען משתתפים...
            </div>
          ) : participantError ? (
            <p className="text-sm text-red-500 py-2">שגיאה בטעינת המשתתפים. לחץ שוב לניסיון חוזר.</p>
          ) : participants.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">אין משתתפים עדיין.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {participants.map((p, i) => (
                <li key={p.id ?? i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{p.full_name ?? 'דייר'}</p>
                    {p.apartment_number && (
                      <p className="text-xs text-gray-500">דירה {p.apartment_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="flex items-center gap-1 text-sky-600 hover:underline text-xs"
                        aria-label={`שלח מייל ל-${p.full_name ?? 'דייר'}`}
                      >
                        <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                        {p.email}
                      </a>
                    )}
                    {p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="flex items-center gap-1 text-emerald-600 hover:underline text-xs"
                        aria-label={`התקשר ל-${p.full_name ?? 'דייר'}`}
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        {p.phone}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}


type OfferStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed';

export default function ContractorActiveOffersPage() {
  const t = useTranslations('contractor.offers');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OfferStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'participants'>('date');

  useEffect(() => {
    async function fetchOffers() {
      let token = accessToken;
      if (isAuthenticated && !token) {
        const ok = await refreshAccessToken();
        if (!ok) return;
        token = useAuthStore.getState().accessToken;
      }
      if (!token) return;

      setIsLoading(true);
      try {
        const data = await apiClient.getOffers(undefined, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
        });
        let list = [...(data.items ?? [])];
        if (sortBy === 'date') {
          list.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        } else if (sortBy === 'price') {
          list.sort((a, b) => {
            const pa = a.tiers[a.currentTier]?.price ?? a.basePrice;
            const pb = b.tiers[b.currentTier]?.price ?? b.basePrice;
            return pa - pb;
          });
        } else if (sortBy === 'participants') {
          list.sort((a, b) => (b.participants ?? 0) - (a.participants ?? 0));
        }
        setOffers(list);
      } catch (error) {
        console.error('Failed to fetch offers:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchOffers().catch(() => {});
  }, [statusFilter, categoryFilter, sortBy, accessToken, isAuthenticated, refreshAccessToken]);

  const statusOptions: { value: OfferStatus; label: string }[] = [
    { value: 'all', label: t('active.filters.allStatuses') },
    { value: 'pending', label: t('active.filters.pending') },
    { value: 'accepted', label: t('active.filters.accepted') },
    { value: 'in_progress', label: t('active.filters.inProgress') },
    { value: 'completed', label: t('active.filters.completed') },
  ];

  const categoryOptions: { value: ServiceCategory | 'all'; label: string }[] = [
    { value: 'all', label: t('active.filters.allCategories') },
    { value: 'ac_installation', label: t('active.categories.ac_installation') },
    { value: 'kitchen', label: t('active.categories.kitchen') },
    { value: 'electrical', label: t('active.categories.electrical') },
    { value: 'plumbing', label: t('active.categories.plumbing') },
    { value: 'painting', label: t('active.categories.painting') },
    { value: 'flooring', label: t('active.categories.flooring') },
    { value: 'windows', label: t('active.categories.windows') },
    { value: 'security', label: t('active.categories.security') },
  ];

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('active.title')}</h1>
        <p className="text-gray-600 mt-2">{t('active.subtitle')}</p>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
          <div className="flex-1 sm:min-w-[200px]">
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700 mb-1">
              {t('active.filters.status')}
            </label>
            <select
              id="filter-status"
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

          <div className="flex-1 sm:min-w-[200px]">
            <label htmlFor="filter-category" className="block text-sm font-medium text-gray-700 mb-1">
              {t('active.filters.category')}
            </label>
            <select
              id="filter-category"
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

          <div className="flex-1 sm:min-w-[200px]">
            <label htmlFor="filter-sort" className="block text-sm font-medium text-gray-700 mb-1">
              {t('active.filters.sortBy')}
            </label>
            <select
              id="filter-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'price' | 'participants')}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              <option value="date">{t('active.filters.sortByDate')}</option>
              <option value="price">{t('active.filters.sortByPrice')}</option>
              <option value="participants">{t('active.filters.sortByParticipants')}</option>
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
            <div key={offer.id} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <OfferCard
                offer={offer}
                variant="contractor"
                showActions
                showParticipants
              />
              <OfferAnalyticsPanel offer={offer} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
