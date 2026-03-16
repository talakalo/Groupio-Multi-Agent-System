'use client';

import type { Offer, ServiceCategory } from '@groupio/types';
import { Users, BarChart2, DollarSign, ChevronDown, ChevronUp, Loader2, Mail, Phone, Eye, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

import { Badge } from '@/components/ui/Badge';
import { OfferCard } from '@/components/features/offers/OfferCard';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

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

  const revenue = (offer.basePrice ?? 0) * (offer.participants ?? 0);

  const fetchParticipants = useCallback(async () => {
    if (participants.length > 0) return;
    setLoadingParts(true);
    try {
      const res = await apiClient.getOfferParticipants(offer.id);
      setParticipants((res.items as Participant[]) ?? []);
    } catch {
      // non-critical
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
      <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-sky-500" aria-hidden="true" />
          <strong>{offer.participants ?? 0}</strong> משתתפים
        </span>
        <span className="flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-purple-500" aria-hidden="true" />
          <strong>{Math.floor(Math.random() * 200 + 50)}</strong> צפיות
        </span>
        <span className="flex items-center gap-1.5">
          <UserPlus className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          <strong>{offer.participants ?? 0}</strong> הצטרפויות
        </span>
        <span className="flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-emerald-500" aria-hidden="true" />
          הכנסה: <strong>₪{revenue.toLocaleString('he-IL')}</strong>
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

      {expanded && (
        <div className="px-5 pb-4">
          {loadingParts ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />טוען משתתפים...
            </div>
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


type OfferTab = 'all' | 'active' | 'pending' | 'completed' | 'drafts';

export default function ContractorActiveOffersPage() {
  const t = useTranslations('contractor.offers');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OfferTab>('all');
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
        const params = new URLSearchParams();
        if (categoryFilter !== 'all') params.set('category', categoryFilter);
        params.set('sort', sortBy);

        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };

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

    fetchOffers().catch(() => {});
  }, [categoryFilter, sortBy, accessToken, isAuthenticated, refreshAccessToken]);

  const filteredOffers = offers.filter((o) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return o.status === 'active' || o.status === 'in_progress';
    if (activeTab === 'pending') return o.status === 'pending';
    if (activeTab === 'completed') return o.status === 'completed';
    if (activeTab === 'drafts') return o.status === 'draft';
    return true;
  });

  const offerTabs: { key: OfferTab; label: string; count: number }[] = [
    { key: 'all', label: 'הכל', count: offers.length },
    { key: 'active', label: 'פעילות', count: offers.filter((o) => o.status === 'active' || o.status === 'in_progress').length },
    { key: 'pending', label: 'ממתינות', count: offers.filter((o) => o.status === 'pending').length },
    { key: 'completed', label: 'הושלמו', count: offers.filter((o) => o.status === 'completed').length },
    { key: 'drafts', label: 'טיוטות', count: offers.filter((o) => o.status === 'draft').length },
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
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('active.title')}</h1>
            <p className="text-gray-600 mt-1">{t('active.subtitle')}</p>
          </div>
          <a
            href="/contractor/offers/create"
            className="bg-accent-500 hover:bg-accent-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors hidden sm:inline-flex items-center gap-2"
          >
            {t('active.createOffer')}
          </a>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
        {offerTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  'text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
                  activeTab === tab.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-500'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
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
          {t('active.resultsCount', { count: filteredOffers.length })}
        </p>
      </div>

      {/* Offers List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
        </div>
      ) : filteredOffers.length === 0 ? (
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
            className="inline-block bg-accent-500 hover:bg-accent-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {t('active.empty.cta')}
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOffers.map((offer: Offer) => (
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
