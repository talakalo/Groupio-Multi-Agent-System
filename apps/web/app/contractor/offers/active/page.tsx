'use client';

import type { Offer, ServiceCategory } from '@groupio/types';
import { Users, BarChart2, DollarSign, ChevronDown, ChevronUp, Loader2, Mail, Phone, Tag, Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

import { OfferCard } from '@/components/features/offers/OfferCard';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

// ---- Participant + analytics panel ----

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
  const t = useTranslations('contractor.offers.active');
  const [expanded, setExpanded] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [participantError, setParticipantError] = useState(false);

  const revenue = (offer.basePrice ?? 0) * (offer.participants ?? 0);

  const fetchParticipants = useCallback(async () => {
    if (participants.length > 0) return;
    setLoadingParts(true);
    setParticipantError(false);
    try {
      const res = await apiClient.getOfferParticipants(offer.id);
      setParticipants((res.items as Participant[]) ?? []);
    } catch { setParticipantError(true); }
    finally { setLoadingParts(false); }
  }, [offer.id, participants.length]);

  const handleToggle = () => { if (!expanded) fetchParticipants(); setExpanded((v) => !v); };

  return (
    <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-5 px-5 py-3 text-sm text-slate-600">
        <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-sky-500" aria-hidden="true" /><strong>{offer.participants ?? 0}</strong> {t('participants')}</span>
        <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-emerald-500" aria-hidden="true" />{t('revenue')} <strong>₪{revenue.toLocaleString('he-IL')}</strong></span>
        <span className="flex items-center gap-1.5"><BarChart2 className="w-4 h-4 text-amber-500" aria-hidden="true" />{t('basePrice')} <strong>₪{(offer.basePrice ?? 0).toLocaleString('he-IL')}</strong></span>
        <button type="button" onClick={handleToggle} className="ms-auto flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold text-sm" aria-expanded={expanded}>
          {expanded ? (<><ChevronUp className="w-4 h-4" aria-hidden="true" />{t('hideParticipants')}</>) : (<><ChevronDown className="w-4 h-4" aria-hidden="true" />{t('showParticipants')}</>)}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-4">
          {loadingParts ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('loadingParticipants')}</div>
          ) : participantError ? (
            <p className="text-sm text-red-500 py-2">{t('errorParticipants')}</p>
          ) : participants.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">{t('noParticipants')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {participants.map((part, i) => (
                <li key={part.id ?? i} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{part.full_name ?? t('residentLabel')}</p>
                    {part.apartment_number && <p className="text-xs text-slate-400">{t('apartmentLabel', { number: part.apartment_number })}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {part.email && <a href={'mailto:' + part.email} className="flex items-center gap-1 text-sky-600 hover:underline text-xs"><Mail className="w-3.5 h-3.5" aria-hidden="true" />{part.email}</a>}
                    {part.phone && <a href={'tel:' + part.phone} className="flex items-center gap-1 text-emerald-600 hover:underline text-xs"><Phone className="w-3.5 h-3.5" aria-hidden="true" />{part.phone}</a>}
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
      if (isAuthenticated && !token) { const ok = await refreshAccessToken(); if (!ok) return; token = useAuthStore.getState().accessToken; }
      if (!token) return;
      setIsLoading(true);
      try {
        const data = await apiClient.getOffers(undefined, { status: statusFilter !== 'all' ? statusFilter : undefined, category: categoryFilter !== 'all' ? categoryFilter : undefined });
        const list = [...(data.items ?? [])];
        if (sortBy === 'date') list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        else if (sortBy === 'price') list.sort((a, b) => { const pa = a.tiers[a.currentTier]?.price ?? a.basePrice; const pb = b.tiers[b.currentTier]?.price ?? b.basePrice; return pa - pb; });
        else if (sortBy === 'participants') list.sort((a, b) => (b.participants ?? 0) - (a.participants ?? 0));
        setOffers(list);
      } catch (error) { console.error('Failed to fetch offers:', error); }
      finally { setIsLoading(false); }
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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('active.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('active.subtitle')}</p>
        </div>
        <Link href="/contractor/offers/create" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
          <Plus className="h-4 w-4" /><span>{t('active.createOffer')}</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
          <div className="flex-1 sm:min-w-[180px]">
            <label htmlFor="filter-status" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('active.filters.status')}</label>
            <select id="filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OfferStatus)} className="input-field text-sm">
              {statusOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex-1 sm:min-w-[180px]">
            <label htmlFor="filter-category" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('active.filters.category')}</label>
            <select id="filter-category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as ServiceCategory | 'all')} className="input-field text-sm">
              {categoryOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex-1 sm:min-w-[180px]">
            <label htmlFor="filter-sort" className="block text-xs font-semibold text-slate-500 mb-1.5">{t('active.filters.sortBy')}</label>
            <select id="filter-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'price' | 'participants')} className="input-field text-sm">
              <option value="date">{t('active.filters.sortByDate')}</option>
              <option value="price">{t('active.filters.sortByPrice')}</option>
              <option value="participants">{t('active.filters.sortByParticipants')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-slate-500">{t('active.resultsCount', { count: offers.length })}</p>

      {/* List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map((i) => <div key={i} className="animate-pulse rounded-2xl bg-white h-32 shadow-sm ring-1 ring-slate-100" />)}
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-100 text-center">
          <Tag className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">{t('active.empty.title')}</h3>
          <p className="text-sm text-slate-500 mb-5">{t('active.empty.description')}</p>
          <Link href="/contractor/offers/create" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-6 py-2.5 text-sm transition-colors">
            <Plus className="h-4 w-4" />{t('active.empty.cta')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {offers.map((offer: Offer) => (
            <div key={offer.id} className="rounded-2xl overflow-hidden ring-1 ring-slate-100 shadow-sm">
              <OfferCard offer={offer} variant="contractor" showActions showParticipants />
              <OfferAnalyticsPanel offer={offer} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
