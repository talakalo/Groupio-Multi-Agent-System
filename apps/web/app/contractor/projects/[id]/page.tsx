'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';

// API returns snake_case: title, building_id, current_participants, pricing_tiers, deadline, created_at
// pricing_tiers: { min_participants, max_participants, discount_percent, price_per_unit }[]
interface TierInput {
  min?: number;
  max?: number | null;
  min_participants?: number;
  max_participants?: number;
  discount?: number;
  discount_percent?: number;
  price?: number;
  price_per_unit?: number;
}

interface ProjectDetail {
  id?: string;
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  building_id?: string;
  building_name?: string;
  buildingId?: string;
  building?: { id: string; name?: string; address?: string; city?: string };
  current_participants?: number;
  participants?: number;
  participantCount?: number;
  base_price?: number;
  basePrice?: number;
  current_price?: number;
  finalPrice?: number;
  completedAt?: string;
  deadline?: string;
  expiresAt?: string;
  created_at?: string;
  createdAt?: string;
  pricing_tiers?: TierInput[];
  tiers?: TierInput[];
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
  const [actionLoading, setActionLoading] = useState<'publish' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);

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
    try {
      const data = await apiClient.getOffer(id);
      setProject(data as unknown as ProjectDetail);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('Project not found');
      } else {
        setError('Failed to load project');
      }
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  }, [id, accessToken, isAuthenticated, refreshAccessToken, router]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  async function handlePublish() {
    if (!id) return;
    setActionLoading('publish');
    setActionError(null);
    try {
      const updated = await apiClient.publishOffer(id);
      setProject(updated as unknown as ProjectDetail);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('publishFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelConfirmed() {
    if (!id) return;
    setShowCancelModal(false);
    setActionLoading('cancel');
    setActionError(null);
    try {
      await apiClient.cancelOffer(id);
      router.push('/contractor/projects');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('cancelFailed'));
      setActionLoading(null);
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending: 'bg-amber-100 text-amber-800',
      matching: 'bg-blue-100 text-blue-800',
      matched: 'bg-primary-50 text-primary-600',
      in_progress: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
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
            {t('backToProjects')}
          </Link>
        </div>
      </div>
    );
  }

  // Normalize tiers: API uses pricing_tiers with min_participants/max_participants/discount_percent/price_per_unit
  const rawTiers = project.pricing_tiers ?? project.tiers ?? [];
  const tiers = rawTiers.map((t: TierInput) => ({
    min: t.min ?? t.min_participants ?? 0,
    max: t.max ?? t.max_participants ?? null,
    discount: (t.discount ?? (t.discount_percent ?? 0) / 100) ?? 0,
    price: t.price ?? t.price_per_unit ?? 0,
  }));
  const currentTierIdx = project.currentTier ?? 0;
  const currentTier = tiers[currentTierIdx];

  const displayPrice =
    project.finalPrice ??
    project.current_price ??
    project.basePrice ??
    project.base_price ??
    currentTier?.price ??
    0;
  const displayParticipants =
    project.participantCount ?? project.participants ?? project.current_participants ?? 0;

  const buildingLabel = project.building
    ? [project.building.name, project.building.address, project.building.city].filter(Boolean).join(' • ') || project.building.id
    : project.building_name ?? project.buildingId ?? project.building_id ?? '—';

  const expiresAt = project.expiresAt ?? project.deadline;

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
                  project.status ?? 'draft'
                )}`}
              >
                {t(`statuses.${project.status ?? 'draft'}`)}
              </span>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-gray-900">
                ₪{displayPrice.toLocaleString('he-IL')}
              </p>
              <p className="text-sm text-gray-500">
                {displayParticipants} {t('participants')}
              </p>
              {/* Draft-only actions */}
              {project.status === 'draft' && (
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-700 disabled:opacity-50"
                  >
                    {actionLoading === 'publish' ? '...' : t('publish')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    {actionLoading === 'cancel' ? '...' : t('cancel')}
                  </button>
                </div>
              )}
              {/* Pending-only cancel */}
              {project.status === 'pending' && (
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    {actionLoading === 'cancel' ? '...' : t('cancelOffer')}
                  </button>
                </div>
              )}
              {actionError && (
                <p className="mt-2 text-red-600 text-xs">{actionError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">{t('description')}</h2>
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
              {new Date(project.createdAt ?? project.created_at ?? '').toLocaleDateString('he-IL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          {expiresAt && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {t('targetDate')}
              </h2>
              <p className="text-gray-900">
                {new Date(expiresAt).toLocaleDateString('he-IL', {
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
              {t('category')}
            </h2>
            <p className="text-gray-900">{tCat(project.category)}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('participants')}
            </h2>
            <p className="text-gray-900">{displayParticipants}</p>
          </div>
          {currentTier && (currentTier.discount > 0 || currentTier.price > 0) && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {t('currentTier')}
              </h2>
              <p className="text-gray-900">
                {Math.round((currentTier.discount ?? 0) * 100)}% — ₪{(currentTier.price ?? 0).toLocaleString('he-IL')}
              </p>
            </div>
          )}
        </div>

        {/* Tiers */}
        {tiers.length > 0 && (
          <div className="p-6 border-t border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('pricingTiers')}</h2>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    idx === currentTierIdx ? 'bg-sky-100 text-sky-800' : 'bg-white border border-gray-200 text-gray-700'
                  }`}
                >
                  {(tier.min ?? 0)}–{tier.max ?? '∞'} {t('participants')}: {Math.round((tier.discount ?? 0) * 100)}% → ₪
                  {(tier.price ?? 0).toLocaleString('he-IL')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full" dir="rtl">
            <h2 id="cancel-modal-title" className="text-lg font-bold text-gray-900 mb-2">
              {t('cancelConfirmTitle')}
            </h2>
            <p className="text-gray-600 text-sm mb-6">{t('cancelConfirm')}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {t('cancelModalBack')}
              </button>
              <button
                type="button"
                onClick={() => void handleCancelConfirmed()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                {t('cancelModalConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
