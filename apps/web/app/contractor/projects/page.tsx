'use client';

import type { Offer } from '@groupio/types';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';

import Link from 'next/link';

import { ApiError, apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

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
  const [reviewBanner, setReviewBanner] = useState<{ offerId: string; ok: boolean; message?: string } | null>(
    null
  );

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
      try {
        const data = await apiClient.getOffers(undefined, {
          status: statusFilter !== 'all' ? statusFilter : undefined,
        });
        let items = [...(data.items ?? [])];
        items = items.filter((o) => new Date(o.createdAt).getFullYear() === year);
        setProjects(items as ProjectWithStats[]);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setIsLoading(false);
      }
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
    } finally {
      setReviewingOfferId(null);
    }
  }

  const ratedProjects = projects.filter((p) => p.rating);
  const stats = {
    total: projects.length,
    completed: projects.filter((p) => p.status === 'completed').length,
    inProgress: projects.filter((p) => p.status === 'in_progress').length,
    totalRevenue: projects.reduce((sum, p) => sum + (p.actualRevenue || 0), 0),
    avgRating:
      ratedProjects.length > 0
        ? ratedProjects.reduce((sum, p) => sum + (p.rating ?? 0), 0) / ratedProjects.length
        : null,
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      {reviewBanner && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            reviewBanner.ok
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          role="status"
        >
          {reviewBanner.ok ? t('requestReviewSuccess') : reviewBanner.message || t('requestReviewError')}
        </div>
      )}

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
            {stats.avgRating !== null ? `${stats.avgRating.toFixed(1)} ⭐` : '--'}
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
          {projects.map((project) => (
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
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                        project.status
                      )}`}
                    >
                      {t(`statuses.${project.status}`)}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {project.building?.name} • {t(`categories.${project.category}`)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-lg font-bold text-gray-900">
                    ₪{(project.actualRevenue || project.finalPrice || 0).toLocaleString()}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {project.participantCount ?? 0} {t('participants')}
                  </p>
                </div>
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
                    type="button"
                    disabled={reviewingOfferId === project.id}
                    onClick={() => void handleRequestReview(project.id)}
                    className="text-sky-600 hover:text-sky-800 disabled:opacity-50 text-sm font-medium ms-4"
                  >
                    {reviewingOfferId === project.id ? t('requestReviewLoading') : t('requestReview')}
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
