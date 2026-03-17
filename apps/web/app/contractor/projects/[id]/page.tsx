'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

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

export default function ContractorProjectDetailPage(props: PageParamsProps) {
  unwrapPageParams(props);
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

  type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'info';
  const STATUS_BADGE_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
    draft: { variant: 'default', label: 'טיוטה' },
    pending: { variant: 'warning', label: 'ממתין' },
    matching: { variant: 'info', label: 'בהתאמה' },
    matched: { variant: 'primary', label: 'הותאם' },
    in_progress: { variant: 'info', label: 'בביצוע' },
    completed: { variant: 'success', label: 'הושלם' },
    cancelled: { variant: 'error', label: 'בוטל' },
    active: { variant: 'success', label: 'פעיל' },
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
              <div className="mt-2">
                <Badge variant={STATUS_BADGE_MAP[project.status ?? 'draft']?.variant ?? 'default'} size="sm">
                  {STATUS_BADGE_MAP[project.status ?? 'draft']?.label ?? t(`statuses.${project.status ?? 'draft'}`)}
                </Badge>
              </div>
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

        {/* Milestone Timeline */}
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">ציר זמן</h2>
          <div className="flex flex-col gap-0">
            {[
              {
                label: 'יצירת הצעה',
                date: project.createdAt ?? project.created_at,
                done: true,
              },
              {
                label: 'התחלת עבודה',
                date: project.status === 'in_progress' || project.status === 'completed'
                  ? project.createdAt ?? project.created_at
                  : null,
                done: project.status === 'in_progress' || project.status === 'completed',
              },
              {
                label: 'השלמה',
                date: project.completedAt ?? null,
                done: project.status === 'completed',
              },
            ].map((milestone, idx, arr) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 shrink-0',
                      milestone.done
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-white border-gray-300'
                    )}
                  />
                  {idx < arr.length - 1 && (
                    <div
                      className={cn(
                        'w-0.5 h-8',
                        milestone.done ? 'bg-emerald-500' : 'bg-gray-200'
                      )}
                    />
                  )}
                </div>
                <div className="-mt-0.5">
                  <p className={cn('text-sm font-medium', milestone.done ? 'text-gray-900' : 'text-gray-400')}>
                    {milestone.label}
                  </p>
                  {milestone.date && (
                    <p className="text-xs text-gray-500">
                      {new Date(milestone.date).toLocaleDateString('he-IL')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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
                תאריך יעד
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
          {currentTier && (currentTier.discount > 0 || currentTier.price > 0) && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                דרגת הנחה נוכחית
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
            <h2 className="text-sm font-semibold text-gray-700 mb-3">דרגות מחיר</h2>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tier, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-lg text-sm ${
                    idx === currentTierIdx ? 'bg-sky-100 text-sky-800' : 'bg-white border border-gray-200 text-gray-700'
                  }`}
                >
                  {(tier.min ?? 0)}–{tier.max ?? '∞'} משתתפים: {Math.round((tier.discount ?? 0) * 100)}% → ₪
                  {(tier.price ?? 0).toLocaleString('he-IL')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
