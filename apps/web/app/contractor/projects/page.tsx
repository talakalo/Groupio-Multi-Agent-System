'use client';

import type { Offer } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, DollarSign, Star, Briefcase, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { ApiError, apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';

type ProjectStatus = 'all' | 'in_progress' | 'completed' | 'cancelled';

interface ProjectWithStats extends Offer {
  title?: string;
  building?: { id: string; name: string; address: string };
  finalPrice?: number;
  participantCount?: number;
  completedAt?: string;
  actualRevenue?: number;
  rating?: number;
  review?: string;
}

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'bg-sky-100 text-sky-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function ContractorProjectsPage() {
  const t = useTranslations('contractor.projects');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [reviewingOfferId, setReviewingOfferId] = useState<string | null>(null);
  const [reviewBanner, setReviewBanner] = useState<{ offerId: string; ok: boolean; message?: string } | null>(null);

  useEffect(() => {
    async function fetchProjects() {
      let token = accessToken;
      if (isAuthenticated && !token) { const ok = await refreshAccessToken(); if (!ok) return; token = useAuthStore.getState().accessToken; }
      if (!token) return;
      setIsLoading(true);
      try {
        const data = await apiClient.getOffers(undefined, { status: statusFilter !== 'all' ? statusFilter : undefined });
        let items = [...(data.items ?? [])];
        items = items.filter((o) => new Date(o.createdAt).getFullYear() === year);
        setProjects(items as ProjectWithStats[]);
      } catch (error) { console.error('Failed to fetch projects:', error); }
      finally { setIsLoading(false); }
    }
    fetchProjects().catch(() => {});
  }, [statusFilter, year, accessToken, isAuthenticated, refreshAccessToken]);

  async function handleRequestReview(offerId: string) {
    setReviewBanner(null);
    setReviewingOfferId(offerId);
    try {
      await apiClient.requestContractorOfferReview(offerId);
      setReviewBanner({ offerId, ok: true });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : t('requestReviewError');
      setReviewBanner({ offerId, ok: false, message: msg });
    } finally { setReviewingOfferId(null); }
  }

  const ratedProjects = projects.filter((p) => p.rating);
  const stats = {
    total: projects.length,
    completed: projects.filter((p) => p.status === 'completed').length,
    inProgress: projects.filter((p) => p.status === 'in_progress').length,
    totalRevenue: projects.reduce((sum, p) => sum + (p.actualRevenue || 0), 0),
    avgRating: ratedProjects.length > 0 ? ratedProjects.reduce((sum, p) => sum + (p.rating ?? 0), 0) / ratedProjects.length : null,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {/* Banner */}
      {reviewBanner && (
        <div role="status" className={cn('rounded-2xl border px-4 py-3 text-sm', reviewBanner.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800')}>
          {reviewBanner.ok ? t('requestReviewSuccess') : reviewBanner.message || t('requestReviewError')}
        </div>
      )}

      {/* KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: Briefcase, label: t('stats.total'), value: String(stats.total), iconBg: 'bg-slate-50', iconColor: 'text-slate-600' },
          { icon: CheckCircle2, label: t('stats.completed'), value: String(stats.completed), iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
          { icon: Clock, label: t('stats.inProgress'), value: String(stats.inProgress), iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
          { icon: DollarSign, label: t('stats.revenue'), value: '₪' + stats.totalRevenue.toLocaleString(), iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
          { icon: Star, label: t('stats.avgRating'), value: stats.avgRating !== null ? stats.avgRating.toFixed(1) : '--', iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{card.value}</p>
                </div>
                <div className={cn('rounded-xl p-2', card.iconBg, card.iconColor)}><Icon className="h-4 w-4" /></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('filters.status')}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)} className="input-field text-sm">
              <option value="all">{t('filters.allStatuses')}</option>
              <option value="in_progress">{t('filters.inProgress')}</option>
              <option value="completed">{t('filters.completed')}</option>
              <option value="cancelled">{t('filters.cancelled')}</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('filters.year')}</label>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input-field text-sm">
              {[2026,2025,2024,2023].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Projects list */}
      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="animate-pulse rounded-2xl bg-white h-32 shadow-sm ring-1 ring-slate-100" />)}</div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-100 text-center">
          <Briefcase className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <div key={project.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-slate-900">{project.title}</h3>
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold', STATUS_BADGE[project.status] ?? 'bg-slate-100 text-slate-600')}>
                      {t('statuses.' + project.status)}
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mt-1">{project.building?.name} • {t('categories.' + project.category)}</p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-bold text-slate-900">₪{(project.actualRevenue || project.finalPrice || 0).toLocaleString()}</p>
                  <p className="text-slate-500 text-xs">{project.participantCount ?? 0} {t('participants')}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4 text-slate-400">
                  <span>{t('startedAt')}: {new Date(project.createdAt).toLocaleDateString('he-IL')}</span>
                  {project.completedAt && <span>{t('completedAt')}: {new Date(project.completedAt).toLocaleDateString('he-IL')}</span>}
                </div>
                {project.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-400 stroke-amber-400" />
                    <span className="font-semibold text-amber-600">{project.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              {project.review && (
                <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                  <p className="text-slate-500 text-sm italic">&ldquo;{project.review}&rdquo;</p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4">
                <Link href={'/contractor/projects/' + project.id} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">{t('viewDetails')}</Link>
                {project.status === 'completed' && !project.review && (
                  <button type="button" disabled={reviewingOfferId === project.id} onClick={() => void handleRequestReview(project.id)}
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50">
                    {reviewingOfferId === project.id ? (<span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('requestReviewLoading')}</span>) : t('requestReview')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
