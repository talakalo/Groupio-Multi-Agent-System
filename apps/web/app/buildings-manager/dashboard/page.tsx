'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, AlertCircle, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

interface BuildingSummary {
  id: string;
  name: string;
  address: string;
  units: number;
  activeOffers: number;
  openEscalations: number;
}

interface ManagerStats {
  totalBuildings: number;
  totalResidents: number;
  openEscalations: number;
  activeOffers: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: 'emerald' | 'amber' | 'red' | 'primary';
  href?: string;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-100', icon: 'text-emerald-500' },
    amber: { bg: 'bg-amber-100', icon: 'text-amber-500' },
    red: { bg: 'bg-red-100', icon: 'text-red-500' },
    primary: { bg: 'bg-primary-100', icon: 'text-primary-500' },
  };
  const colors = colorMap[color];

  const card = (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', colors.bg)}>
          <Icon className={cn('h-6 w-6', colors.icon)} />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

export default function BuildingsManagerDashboardPage() {
  const t = useTranslations('buildingsManager.dashboard');
  const accessToken = useAuthStore((s) => s.accessToken);

  const statsQuery = useQuery<ManagerStats>({
    queryKey: ['buildings-manager', 'stats'],
    queryFn: async () => {
      const [buildingsResult, escalationsResult] = await Promise.allSettled([
        apiClient.listBuildings({ page_size: 100 }),
        apiClient.listEscalations({ status: 'open', page_size: 1 }),
      ]);

      const buildings =
        buildingsResult.status === 'fulfilled' ? buildingsResult.value : { items: [], total: 0 };
      const escalations =
        escalationsResult.status === 'fulfilled' ? escalationsResult.value : { items: [], total: 0 };

      const items = (buildings.items ?? []) as unknown as BuildingSummary[];
      const totalResidents = items.reduce((sum: number, b: BuildingSummary) => sum + (b.units ?? 0), 0);
      const activeOffers = items.reduce((sum: number, b: BuildingSummary) => sum + (b.activeOffers ?? 0), 0);

      return {
        totalBuildings: buildings.total ?? items.length,
        totalResidents,
        openEscalations: escalations.total ?? 0,
        activeOffers,
      };
    },
    enabled: !!accessToken,
  });

  const buildingsQuery = useQuery<{ items: BuildingSummary[] }>({
    queryKey: ['buildings-manager', 'buildings', 'recent'],
    queryFn: async () => {
      const data = await apiClient.listBuildings({ page_size: 5 });
      return { items: (data.items ?? []) as unknown as BuildingSummary[] };
    },
    enabled: !!accessToken,
  });

  const escalationsQuery = useQuery<{
    items: { id: string; reason: string; priority: string; created_at: string }[];
  }>({
    queryKey: ['buildings-manager', 'escalations', 'open'],
    queryFn: async () => {
      const data = await apiClient.listEscalations({ status: 'open', page_size: 5 });
      return {
        items: (data.items ?? []) as unknown as { id: string; reason: string; priority: string; created_at: string }[],
      };
    },
    enabled: !!accessToken,
  });

  const stats = statsQuery.data;
  const buildings = buildingsQuery.data?.items ?? [];
  const escalations = escalationsQuery.data?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label={t('stats.totalBuildings')}
          value={stats?.totalBuildings ?? '-'}
          color="emerald"
          href="/buildings-manager/buildings"
        />
        <StatCard
          icon={Users}
          label={t('stats.totalResidents')}
          value={stats?.totalResidents ?? '-'}
          color="primary"
        />
        <StatCard
          icon={TrendingUp}
          label={t('stats.activeOffers')}
          value={stats?.activeOffers ?? '-'}
          color="amber"
        />
        <StatCard
          icon={AlertCircle}
          label={t('stats.openEscalations')}
          value={stats?.openEscalations ?? '-'}
          color="red"
          href="/buildings-manager/escalations"
        />
      </div>

      {/* Buildings + Escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent buildings */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t('recentBuildings')}</h2>
            <Link
              href="/buildings-manager/buildings"
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('viewAll')}
            </Link>
          </div>
          <div className="card p-0 divide-y divide-gray-50">
            {buildingsQuery.isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-xl flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-2 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : buildings.length > 0 ? (
              buildings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{b.name ?? b.address}</p>
                    <p className="text-xs text-gray-400">{b.address}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700">{b.units} {t('units')}</p>
                    {(b.openEscalations ?? 0) > 0 && (
                      <p className="text-xs text-red-500 font-medium">{b.openEscalations} {t('open')}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-gray-400">{t('noBuildings')}</div>
            )}
          </div>
        </div>

        {/* Open escalations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t('openEscalations')}</h2>
            <Link
              href="/buildings-manager/escalations"
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              {t('viewAll')}
            </Link>
          </div>
          <div className="card p-0 divide-y divide-gray-50">
            {escalationsQuery.isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            ) : escalations.length > 0 ? (
              escalations.map((esc) => (
                <div key={esc.id} className="flex items-center gap-3 p-4">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      esc.priority === 'critical' ? 'bg-red-500' :
                      esc.priority === 'high' ? 'bg-orange-500' : 'bg-amber-400'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{esc.reason}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(esc.created_at).toLocaleDateString('he-IL')}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                      esc.priority === 'critical' ? 'bg-red-100 text-red-700' :
                      esc.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-amber-100 text-amber-700'
                    )}
                  >
                    {esc.priority}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-gray-400">{t('noEscalations')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
