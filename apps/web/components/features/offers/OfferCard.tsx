'use client';

import type { Offer, PricingTier, ServiceCategory } from '@groupio/types';
import {
  Users,
  Clock,
  ChevronLeft,
  BadgeCheck,
  TrendingDown,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferCardProps {
  offer: Offer;
  /** Callback when the user clicks "Join Offer" */
  onJoin?: (offerId: string) => void;
  /** Callback when the user clicks "View Details" */
  onViewDetails?: (offerId: string) => void;
  /** Whether the current user already joined */
  joined?: boolean;
  /** Card variant - different styling for different contexts */
  variant?: 'resident' | 'contractor' | 'admin';
  /** Show action buttons */
  showActions?: boolean;
  /** Show participant count prominently */
  showParticipants?: boolean;
  /** Compact mode for smaller cards */
  compact?: boolean;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  draft: 'bg-gray-100 text-gray-600',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-500',
};

const STATUS_KEYS = ['active', 'pending', 'draft', 'completed', 'cancelled', 'expired'] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

const CATEGORY_KEYS: ReadonlyArray<ServiceCategory> = [
  'ac_installation', 'ac_maintenance', 'kitchen', 'electrical', 'plumbing',
  'heating', 'renovations', 'painting', 'flooring', 'windows', 'security',
];

function formatCurrency(amount: number): string {
  return `₪${Math.round(amount).toLocaleString('en-IL')}`;
}

function getCurrentTier(offer: Offer): PricingTier | undefined {
  return offer.tiers.find(
    (t) => offer.participants >= t.min && (t.max === null || offer.participants <= t.max),
  );
}

function getNextTier(offer: Offer): PricingTier | undefined {
  const currentIdx = offer.tiers.findIndex(
    (t) => offer.participants >= t.min && (t.max === null || offer.participants <= t.max),
  );
  if (currentIdx === -1) return offer.tiers[0];
  return offer.tiers[currentIdx + 1];
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfferCard({
  offer,
  onJoin,
  onViewDetails,
  joined = false,
  variant: _variant = 'resident',
  showActions: _showActions = true,
  showParticipants: _showParticipants = true,
  compact: _compact = false,
  className,
}: OfferCardProps) {
  const t = useTranslations('offers');
  const currentTier = useMemo(() => getCurrentTier(offer), [offer]);
  const nextTier = useMemo(() => getNextTier(offer), [offer]);
  const expiresInDays = useMemo(() => daysUntil(offer.expiresAt), [offer.expiresAt]);

  const currentPrice = currentTier?.price ?? offer.basePrice;
  const currentDiscount = currentTier?.discount ?? 0;
  const neededForNext = nextTier ? nextTier.min - offer.participants : 0;

  return (
    <div
      data-testid="offer-card"
      className={cn(
        'card group flex flex-col gap-4 overflow-hidden',
        'hover:border-primary-200 transition-all duration-200',
        className,
      )}
    >
      {/* ---- Top row: category + status ---- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">
            {CATEGORY_KEYS.includes(offer.category)
              ? t(`categories.${offer.category as ServiceCategory}`)
              : offer.category}
          </span>
          <h3 className="text-base font-bold text-gray-900 line-clamp-1">
            {offer.contractor?.businessName ?? ""}
          </h3>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            STATUS_STYLES[offer.status] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {STATUS_KEYS.includes(offer.status as StatusKey)
            ? t(offer.status as StatusKey)
            : offer.status}
        </span>
      </div>

      {/* ---- Pricing row ---- */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">{t('currentPrice')}</span>
          <span className="text-xl font-bold text-gray-900">
            {formatCurrency(currentPrice)}
          </span>
          {currentDiscount > 0 && (
            <span className="mt-0.5 text-xs text-gray-400 line-through">
              {formatCurrency(offer.basePrice)}
            </span>
          )}
        </div>

        {currentDiscount > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">
              {currentDiscount}%
            </span>
          </div>
        )}
      </div>

      {/* ---- Participants ---- */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-primary-500" />
          <span>{t('participants', { count: offer.participants })}</span>
        </div>

        {offer.contractor?.verified && (
          <div className="flex items-center gap-1 text-emerald-600">
            <BadgeCheck className="h-4 w-4" />
            <span className="text-xs font-medium">{t('verifiedContractor')}</span>
          </div>
        )}
      </div>

      {/* ---- Next tier progress ---- */}
      {nextTier && neededForNext > 0 && (
        <div data-testid="tier-progress" className="rounded-xl bg-primary-50 px-3.5 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-primary-700 font-medium">
              {t('nextTier', { needed: neededForNext, discount: nextTier.discount })}
            </span>
            <span className="font-bold text-primary-600">
              {formatCurrency(nextTier.price)}
            </span>
          </div>

          {/* Progress bar */}
          {currentTier && nextTier && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary-100">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    ((offer.participants - currentTier.min) /
                      (nextTier.min - currentTier.min)) *
                      100,
                  )}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ---- Expiration ---- */}
      {offer.status === 'active' && expiresInDays > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Clock className="h-3.5 w-3.5" />
          <span>{t('expiresIn', { days: expiresInDays })}</span>
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        {!joined ? (
          <button
            type="button"
            onClick={() => onJoin?.(offer.id)}
            className={cn(
              'btn-primary flex-1 flex items-center justify-center gap-2 text-sm',
            )}
          >
            <Users className="h-4 w-4" />
            {t('joinOffer')}
          </button>
        ) : (
          <div className="flex-1 rounded-xl bg-emerald-50 py-2.5 text-center text-sm font-medium text-emerald-700">
            {t('joined')}
          </div>
        )}

        <button
          type="button"
          onClick={() => onViewDetails?.(offer.id)}
          className={cn(
            'btn-secondary flex items-center justify-center gap-1 text-sm',
          )}
        >
          {t('details')}
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
