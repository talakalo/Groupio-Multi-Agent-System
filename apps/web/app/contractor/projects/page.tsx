'use client';

import type { Offer } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
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

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'info';

const STATUS_BADGE_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  in_progress: { variant: 'info', label: 'בביצוע' },
  completed: { variant: 'success', label: 'הושלם' },
  cancelled: { variant: 'error', label: 'בוטל' },
  pending: { variant: 'warning', label: 'ממתין' },
  active: { variant: 'primary', label: 'פעיל' },
  draft: { variant: 'default', label: 'טיוטה' },
};

function MilestoneTimeline({ project }: { project: ProjectWithStats }) {
  const milestones = [
    {
      label: 'יצירת הצעה',
      date: project.createdAt,
      done: true,
    },
    {
      label: 'התחלת עבודה',
      date: project.status === 'in_progress' || project.status === 'completed' ? project.createdAt : null,
      done: project.status === 'in_progress' || project.status === 'completed',
    },
    {
      label: 'השלמה',
      date: project.completedAt ?? null,
      done: project.status === 'completed',
    },
  ];

  return (
    <div className="flex items-center gap-0">
      {milestones.map((m, idx) => (
        <div key={idx} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-3 h-3 rounded-full border-2',
                m.done
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'bg-white border-gray-300'
              )}
            />
            <span className="text-[10px] text-gray-500 mt-1 whitespace-nowrap">{m.label}</span>
          </div>
          {idx < milestones.length - 1 && (
            <div
              className={cn(
                'h-0.5 w-8 mx-1 -mt-4',
                m.done ? 'bg-emerald-500' : 'bg-gray-200'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ContractorProjectsPage() {
  const t = useTranslations('contractor.projects');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>('all');
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    async function fetchProjects() {
      let token = accessToken;
      if (isAuthenticated && !token) {
        const ok = await refreshAccessToken();
        if (!ok) return;
        token = useAuthStore.getState().accessToken;
      }
      if (!token) return;

      setIsLoading(true);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        params.set('year', year.toString());

        const res = await fetch(`${apiBase}/api/v1/offers?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setProjects(data.items ?? data.offers ?? []);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjects().catch(() => {});
  }, [statusFilter, year, accessToken, isAuthenticated, refreshAccessToken]);

  const stats = {
    total: projects.length,
    completed: projects.filter((p) => p.status === 'completed').length,
    inProgress: projects.filter((p) => p.status === 'in_progress').length,
    totalRevenue: projects.reduce((sum, p) => sum + (p.actualRevenue || 0), 0),
    avgRating:
      projects.filter((p) => p.rating).reduce((sum, p) => sum + (p.rating || 0), 0) /
        projects.filter((p) => p.rating).length || 0,
  };

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-gray-500 text-sm">{t('stats.total')}</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-gray-500 text-sm">{t('stats.completed')}</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-gray-500 text-sm">{t('stats.inProgress')}</p>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-gray-500 text-sm">{t('stats.revenue')}</p>
          <p className="text-2xl font-bold text-gray-900">₪{stats.totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-gray-500 text-sm">{t('stats.avgRating')}</p>
          <p className="text-2xl font-bold text-yellow-600">
            {stats.avgRating.toFixed(1)} ★
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('filters.status')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus)}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              <option value="all">{t('filters.allStatuses')}</option>
              <option value="in_progress">{t('filters.inProgress')}</option>
              <option value="completed">{t('filters.completed')}</option>
              <option value="cancelled">{t('filters.cancelled')}</option>
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('filters.year')}
            </label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            >
              {[2026, 2025, 2024, 2023].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Projects List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => {
            const badgeInfo = STATUS_BADGE_MAP[project.status] ?? { variant: 'default' as BadgeVariant, label: project.status };

            return (
              <div
                key={project.id}
                className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {project.title}
                      </h3>
                      <Badge variant={badgeInfo.variant} size="sm">
                        {badgeInfo.label}
                      </Badge>
                    </div>
                    <p className="text-gray-500 text-sm mt-1">
                      {project.building?.name} • {t(`categories.${project.category}`)}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-gray-900">
                      ₪{(project.actualRevenue || project.finalPrice || 0).toLocaleString()}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {project.participantCount} {t('participants')}
                    </p>
                  </div>
                </div>

                {/* Milestone Timeline */}
                <div className="mb-4">
                  <MilestoneTimeline project={project} />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-gray-500">
                    <span>
                      {t('startedAt')}: {new Date(project.createdAt).toLocaleDateString('he-IL')}
                    </span>
                    {project.completedAt && (
                      <span>
                        {t('completedAt')}: {new Date(project.completedAt).toLocaleDateString('he-IL')}
                      </span>
                    )}
                  </div>
                  {project.rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-500">★</span>
                      <span className="font-medium">{project.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {project.review && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-gray-600 text-sm italic">&ldquo;{project.review}&rdquo;</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t flex gap-2">
                  <Link
                    href={`/contractor/projects/${project.id}`}
                    className="text-sky-600 hover:text-sky-700 text-sm font-medium"
                  >
                    {t('viewDetails')}
                  </Link>
                  {project.status === 'completed' && !project.review && (
                    <button
                      disabled
                      title="בקרוב"
                      className="text-gray-500 hover:text-gray-700 text-sm font-medium mr-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('requestReview')}
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
