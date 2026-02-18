'use client';

import type { PricingTier } from '@groupio/types';
import { Users, Check, TrendingDown, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PricingTiersProps {
  /** Tier definitions (e.g., 5/10/15/20 units with increasing discounts). If not provided, default tiers are generated. */
  tiers?: PricingTier[];
  /** Base price before any group discount */
  basePrice: number;
  /** How many residents have already joined */
  currentParticipants: number;
  /** Optional unit label ("דירה" / "unit") */
  unitLabel?: string;
  /** Additional CSS class names */
  className?: string;
}

/** Generate default pricing tiers based on base price */
function generateDefaultTiers(basePrice: number): PricingTier[] {
  return [
    { min: 3, max: 5, discount: 5, price: basePrice * 0.95 },
    { min: 6, max: 10, discount: 10, price: basePrice * 0.90 },
    { min: 11, max: 15, discount: 15, price: basePrice * 0.85 },
    { min: 16, max: null, discount: 20, price: basePrice * 0.80 },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `₪${Math.round(amount).toLocaleString('en-IL')}`;
}

function getTierStatus(
  tier: PricingTier,
  currentParticipants: number,
): 'reached' | 'current' | 'upcoming' {
  if (
    currentParticipants >= tier.min &&
    (tier.max === null || currentParticipants <= tier.max)
  ) {
    return 'current';
  }
  if (currentParticipants > (tier.max ?? Infinity)) {
    return 'reached';
  }
  return 'upcoming';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PricingTiers({
  tiers: tiersProp,
  basePrice,
  currentParticipants,
  unitLabel = 'דירות',
  className,
}: PricingTiersProps) {
  // Use provided tiers or generate defaults
  const tiers = useMemo(
    () => tiersProp ?? generateDefaultTiers(basePrice),
    [tiersProp, basePrice],
  );

  const activeTierIdx = useMemo(
    () =>
      tiers.findIndex(
        (t) =>
          currentParticipants >= t.min &&
          (t.max === null || currentParticipants <= t.max),
      ),
    [tiers, currentParticipants],
  );

  const nextTier = useMemo(() => {
    if (activeTierIdx === -1) return tiers[0];
    return tiers[activeTierIdx + 1];
  }, [tiers, activeTierIdx]);

  const totalSavings = useMemo(() => {
    const activeTier = activeTierIdx >= 0 ? tiers[activeTierIdx] : undefined;
    if (!activeTier) return 0;
    return (basePrice - activeTier.price) * currentParticipants;
  }, [tiers, activeTierIdx, basePrice, currentParticipants]);

  // Progress to next tier
  const progressToNext = useMemo(() => {
    if (!nextTier) return 100;
    const currentTier = activeTierIdx >= 0 ? tiers[activeTierIdx] : undefined;
    const start = currentTier?.min ?? 0;
    const end = nextTier.min;
    if (end <= start) return 100;
    return Math.min(100, ((currentParticipants - start) / (end - start)) * 100);
  }, [nextTier, activeTierIdx, tiers, currentParticipants]);

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">מדרגות מחיר</h3>
        <div className="flex items-center gap-1.5 text-sm text-primary-600 font-medium">
          <Users className="h-4 w-4" />
          <span>{currentParticipants} {unitLabel}</span>
        </div>
      </div>

      {/* ---- Tier cards ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier, idx) => {
          const status = getTierStatus(tier, currentParticipants);
          const isCurrent = status === 'current';
          const isReached = status === 'reached';
          const rangeLabel = tier.max
            ? `${tier.min}-${tier.max}`
            : `${tier.min}+`;

          return (
            <div
              key={idx}
              className={cn(
                'relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all',
                isCurrent
                  ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-100'
                  : isReached
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-gray-200 bg-white',
              )}
            >
              {/* Current badge */}
              {isCurrent && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-3 py-0.5 text-[11px] font-bold text-white">
                  שלב נוכחי
                </div>
              )}

              {/* Reached checkmark */}
              {isReached && (
                <div className="absolute -top-2 -end-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}

              {/* Unit range */}
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Users className="h-3.5 w-3.5" />
                <span>{rangeLabel} {unitLabel}</span>
              </div>

              {/* Discount percentage */}
              <div
                className={cn(
                  'flex items-center gap-1 text-2xl font-extrabold',
                  isCurrent
                    ? 'text-primary-600'
                    : isReached
                      ? 'text-emerald-600'
                      : 'text-gray-400',
                )}
              >
                <TrendingDown className="h-5 w-5" />
                {tier.discount}%
              </div>

              {/* Price per unit */}
              <span
                className={cn(
                  'text-sm font-semibold',
                  isCurrent
                    ? 'text-primary-700'
                    : isReached
                      ? 'text-emerald-700'
                      : 'text-gray-500',
                )}
              >
                {formatCurrency(tier.price)} ליחידה
              </span>

              {/* Savings compared to base */}
              <span className="text-xs text-gray-400">
                חיסכון {formatCurrency(basePrice - tier.price)} ליחידה
              </span>
            </div>
          );
        })}
      </div>

      {/* ---- Progress to next tier ---- */}
      {nextTier && (
        <div className="rounded-xl bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-gray-700">
              עוד {nextTier.min - currentParticipants} {unitLabel} ל-{nextTier.discount}% הנחה
            </span>
            <span className="text-gray-500">
              {formatCurrency(nextTier.price)} ליחידה
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gradient-to-l from-primary-400 to-primary-600 transition-all duration-700 ease-out"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-gray-400">
            <span>{currentParticipants} {unitLabel}</span>
            <span>{nextTier.min} {unitLabel}</span>
          </div>
        </div>
      )}

      {/* ---- Savings summary ---- */}
      {totalSavings > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <Sparkles className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-emerald-800">
              חיסכון כולל לקבוצה
            </span>
            <span className="text-lg font-extrabold text-emerald-700">
              {formatCurrency(totalSavings)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
