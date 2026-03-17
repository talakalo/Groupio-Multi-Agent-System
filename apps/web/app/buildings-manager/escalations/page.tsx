'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

type EscalationStatus = 'open' | 'in_progress' | 'resolved';
type EscalationPriority = 'low' | 'medium' | 'high' | 'critical';

const PRIORITY_ORDER: Record<EscalationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_BADGE_VARIANT: Record<EscalationPriority, 'error' | 'warning' | 'primary' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'primary',
  low: 'default',
};

interface Escalation {
  id: string;
  reason: string;
  priority: EscalationPriority;
  status: EscalationStatus;
  source_agent: string;
  user_id?: string;
  building_id?: string;
  assigned_to?: string;
  created_at: string;
  resolved_at?: string;
  resolution_notes?: string;
}

const PRIORITY_STYLES: Record<EscalationPriority, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-600',
};

const STATUS_ICONS: Record<EscalationStatus, React.ElementType> = {
  open: AlertCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
};

const STATUS_STYLES: Record<EscalationStatus, string> = {
  open: 'text-red-500',
  in_progress: 'text-amber-500',
  resolved: 'text-emerald-500',
};

export default function BuildingsManagerEscalationsPage(props: PageParamsProps) {
  unwrapPageParams(props);
  const t = useTranslations('buildingsManager.escalations');
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<EscalationStatus | 'all'>('open');
  const [priorityFilter, setPriorityFilter] = useState<EscalationPriority | 'all'>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const authHeaders: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  const escalationsQuery = useQuery<{ items: Escalation[]; total: number }>({
    queryKey: ['buildings-manager', 'escalations', statusFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: '50' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const res = await fetch(`${apiBase}/api/v1/escalations?${params}`, { headers: authHeaders });
      if (!res.ok) return { items: [], total: 0 };
      return res.json();
    },
    enabled: !!accessToken,
  });

  const resolveMutation = useMutation({
    mutationFn: async (escalationId: string) => {
      const res = await fetch(`${apiBase}/api/v1/escalations/${escalationId}/resolve`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ resolution_notes: 'Resolved by buildings manager' }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings-manager', 'escalations'] });
      setResolvingId(null);
    },
  });

  const rawEscalations = escalationsQuery.data?.items ?? [];
  const escalations = [...rawEscalations].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 mt-1">
          {t('total', { count: escalationsQuery.data?.total ?? 0 })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EscalationStatus | 'all')}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pe-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <option value="all">{t('filters.allStatuses')}</option>
            <option value="open">{t('filters.open')}</option>
            <option value="in_progress">{t('filters.inProgress')}</option>
            <option value="resolved">{t('filters.resolved')}</option>
          </select>
          <ChevronDown className="absolute end-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as EscalationPriority | 'all')}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2 pe-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <option value="all">{t('filters.allPriorities')}</option>
            <option value="critical">{t('filters.critical')}</option>
            <option value="high">{t('filters.high')}</option>
            <option value="medium">{t('filters.medium')}</option>
            <option value="low">{t('filters.low')}</option>
          </select>
          <ChevronDown className="absolute end-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Escalations list */}
      {escalationsQuery.isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : escalations.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-emerald-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {escalations.map((esc) => {
            const StatusIcon = STATUS_ICONS[esc.status];
            return (
              <div key={esc.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <StatusIcon
                      className={cn('h-5 w-5 flex-shrink-0 mt-0.5', STATUS_STYLES[esc.status])}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{esc.reason}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <Badge variant={PRIORITY_BADGE_VARIANT[esc.priority]} size="sm">
                          {esc.priority}
                        </Badge>
                        <span className="text-xs text-gray-400">{esc.source_agent}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(esc.created_at).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                      {esc.resolution_notes && (
                        <p className="text-sm text-gray-500 mt-2 italic">{esc.resolution_notes}</p>
                      )}
                    </div>
                  </div>

                  {esc.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => {
                        setResolvingId(esc.id);
                        resolveMutation.mutate(esc.id);
                      }}
                      disabled={resolveMutation.isPending && resolvingId === esc.id}
                      className={cn(
                        'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                        'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {resolveMutation.isPending && resolvingId === esc.id
                        ? t('resolving')
                        : t('resolve')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
