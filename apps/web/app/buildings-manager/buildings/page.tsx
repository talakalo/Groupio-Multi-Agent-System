'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Users, AlertCircle, Search, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useMemo } from 'react';

import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

interface Building {
  id: string;
  name?: string;
  address: string;
  city?: string;
  units: number;
  region?: string;
  type?: string;
  activeOffers?: number;
  openEscalations?: number;
  admin_user_id?: string;
}

export default function BuildingsManagerBuildingsPage() {
  const t = useTranslations('buildingsManager.buildings');
  const accessToken = useAuthStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'units' | 'escalations'>('name');
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const headers: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const buildingsQuery = useQuery<{ items: Building[]; total: number }>({
    queryKey: ['buildings-manager', 'buildings'],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/api/v1/buildings?page_size=50`, { headers });
      if (!res.ok) return { items: [], total: 0 };
      return res.json();
    },
    enabled: !!accessToken,
  });

  const buildings = buildingsQuery.data?.items ?? [];

  const regions = useMemo(() => {
    const set = new Set<string>();
    buildings.forEach((b) => { if (b.region) set.add(b.region); });
    return Array.from(set).sort();
  }, [buildings]);

  const filtered = useMemo(() => {
    let result = buildings;
    if (selectedBuildingId) {
      result = result.filter((b) => b.id === selectedBuildingId);
    } else if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          (b.name ?? b.address).toLowerCase().includes(q) ||
          (b.city ?? '').toLowerCase().includes(q)
      );
    }
    if (regionFilter !== 'all') {
      result = result.filter((b) => b.region === regionFilter);
    }
    const sorted = [...result];
    switch (sortBy) {
      case 'units':
        sorted.sort((a, b) => b.units - a.units);
        break;
      case 'escalations':
        sorted.sort((a, b) => (b.openEscalations ?? 0) - (a.openEscalations ?? 0));
        break;
      default:
        sorted.sort((a, b) => (a.name ?? a.address).localeCompare(b.name ?? b.address));
    }
    return sorted;
  }, [buildings, search, selectedBuildingId, regionFilter, sortBy]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('total', { count: buildingsQuery.data?.total ?? 0 })}
          </p>
        </div>
      </div>

      {/* Sub-nav: building quick-switch when multiple buildings */}
      {buildings.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => { setSelectedBuildingId(null); setSearch(''); }}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors',
              !selectedBuildingId ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {t('allBuildings') || 'הכל'}
          </button>
          {buildings.slice(0, 8).map((b) => {
            const label = b.name ?? b.address;
            const isActive = selectedBuildingId === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBuildingId(b.id)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors truncate max-w-[160px]',
                  isActive ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
                title={label}
              >
                {label.length > 20 ? `${label.slice(0, 18)}…` : label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-300 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pe-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="all">{t('allRegions')}</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="absolute end-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'units' | 'escalations')}
              className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pe-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <option value="name">{t('sortByName')}</option>
              <option value="units">{t('sortByUnits')}</option>
              <option value="escalations">{t('sortByEscalations')}</option>
            </select>
            <ChevronDown className="absolute end-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* List */}
      {buildingsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-200 rounded w-16" />
                <div className="h-3 bg-gray-200 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {search ? t('noResults') : t('empty')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((building) => (
            <div key={building.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {building.name ?? building.address}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">{building.address}</p>
                  {building.city && (
                    <p className="text-xs text-gray-400">{building.city}</p>
                  )}
                </div>
                {(building.openEscalations ?? 0) > 0 && (
                  <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    <AlertCircle className="h-3 w-3" />
                    {building.openEscalations}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {t('units', { count: building.units })}
                </span>
                {building.type && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {building.type}
                  </span>
                )}
                {building.region && (
                  <span className="text-xs text-gray-400">{building.region}</span>
                )}
              </div>

              {(building.activeOffers ?? 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className={cn('text-xs font-medium text-emerald-600')}>
                    {t('activeOffers', { count: building.activeOffers })}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
