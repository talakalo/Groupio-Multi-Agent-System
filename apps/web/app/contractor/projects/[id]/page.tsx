'use client';

import type { Offer } from '@groupio/types';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/lib/stores/authStore';

interface ProjectDetail extends Offer {
  title?: string;
  description?: string;
  building?: { id: string; name?: string; address?: string; city?: string };
  finalPrice?: number;
  participantCount?: number;
  completedAt?: string;
  tiers?: { min: number; max: number | null; discount: number; price: number }[];
  currentTier?: number;
}

export default function ContractorProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const t = useTranslations('contractor.projects');
  const tCat = useTranslations('categories');
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!id) {
      setError('Invalid project ID');
      setIsLoading(false);
      return;
    }

    let token = accessToken;
    if (isAuthenticated && !token) {
      const ok = await refreshAccessToken();
      if (!ok) {
        router.replace('/login');
        return;
      }
      token = useAuthStore.getState().accessToken;
    }
    if (!token) {
      router.replace('/login');
      return;
    }

    setIsLoading(true);
    setError(null);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    try {
      const res = await fetch(`${apiBase}/api/v1/offers/${id}`, { headers });
      if (!res.ok) {
        if (res.status === 404) {
          setError('Project not found');
        } else {
          setError('Failed to load project');
        }
        setProject(null);
        return;
      }
      const data = await res.json();
      setProject(data);
    } catch {
      setError('Failed to load project');
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  }, [id, accessToken, isAuthenticated, refreshAccessToken, router]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-amber-100 text-amber-800',
      active: 'bg-emerald-100 text-emerald-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8" dir="rtl">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="container mx-auto px-4 py-8" dir="rtl">
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <p className="text-gray-600 mb-4">{error ?? 'Project not found'}</p>
          <Link
            href="/contractor/projects"
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            חזרה לפרויקטים
          </Link>
        </div>
      </div>
    );
  }

  const displayPrice = project.finalPrice ?? project.basePrice;
  const tiers = project.tiers ?? [];
  const currentTierIdx = project.currentTier ?? 0;
  const currentTier = tiers[currentTierIdx];
  const displayParticipants = project.participantCount ?? project.participants ?? 0;
  const buildingLabel = project.building
    ? [project.building.name, project.building.address, project.building.city].filter(Boolean).join(' • ') || project.building.id
    : project.buildingId ?? '—';

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <div className="mb-6">
        <Link
          href="/contractor/projects"
          className="text-sky-600 hover:text-sky-700 text-sm font-medium inline-flex items-center gap-1"
        >
          ← חזרה לפרויקטים
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {project.title ?? project.category ?? 'Project'}
              </h1>
              <p className="text-gray-500 mt-1">
                {tCat(project.category)} • {buildingLabel}
              </p>
              <span
                className={`inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                  project.status
                )}`}
              >
                {t(`statuses.${project.status}`)}
              </span>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-gray-900">
                ₪{displayPrice.toLocaleString('he-IL')}
              </p>
              <p className="text-sm text-gray-500">
                {displayParticipants} {t('participants')}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">תיאור</h2>
            <p className="text-gray-600 text-sm">{project.description}</p>
          </div>
        )}

        {/* Details grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('startedAt')}
            </h2>
            <p className="text-gray-900">
              {new Date(project.createdAt).toLocaleDateString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          {project.expiresAt && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                תאריך יעד
              </h2>
              <p className="text-gray-900">
                {new Date(project.expiresAt).toLocaleDateString('he-IL', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
          {project.completedAt && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {t('completedAt')}
              </h2>
              <p className="text-gray-900">
                {new Date(project.completedAt).toLocaleDateString('he-IL', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              קטגוריה
            </h2>
            <p className="text-gray-900">{tCat(project.category)}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('participants')}
            </h2>
            <p className="text-gray-900">{displayParticipants}</p>
          </div>
          {currentTier && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                דרגת הנחה נוכחית
              </h2>
              <p className="text-gray-900">
                {Math.round((currentTier.discount ?? 0) * 100)}% — ₪{currentTier.price?.toLocaleString('he-IL')}
              </p>
            </div>
          )}
        </div>

        {/* Tiers */}
        {tiers.length > 0 && (
          <div className="p-6 border-t border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">דרגות מחיר</h2>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    idx === currentTierIdx ? 'bg-sky-100 text-sky-800' : 'bg-white border border-gray-200 text-gray-700'
                  }`}
                >
                  {tier.min}–{tier.max ?? '∞'} משתתפים: {Math.round((tier.discount ?? 0) * 100)}% → ₪
                  {tier.price?.toLocaleString('he-IL')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
