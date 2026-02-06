'use client';

import {
  Star,
  BadgeCheck,
  Shield,
  Clock,
  Tag,
  Phone,
  ChevronLeft,
} from 'lucide-react';
import type { ContractorMatch, ServiceCategory } from '@groupio/types';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractorCardProps {
  /** Contractor match result from the matching agent */
  match: ContractorMatch;
  /** Specialties to show as tag chips */
  specialties?: ServiceCategory[];
  /** Estimated price for the service */
  priceEstimate?: number;
  /** Whether the contractor is currently available */
  available?: boolean;
  /** Years in business (optional display) */
  yearsInBusiness?: number;
  /** Callback when "Request Quote" is clicked */
  onRequestQuote?: (contractorId: string) => void;
  /** Callback when "View Profile" is clicked */
  onViewProfile?: (contractorId: string) => void;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ac_installation: 'התקנת מזגנים',
  ac_maintenance: 'תחזוקת מזגנים',
  kitchen: 'מטבחים',
  electrical: 'חשמל',
  plumbing: 'אינסטלציה',
  heating: 'חימום',
  renovations: 'שיפוצים',
  painting: 'צביעה',
  flooring: 'ריצוף',
  windows: 'חלונות',
};

function formatCurrency(amount: number): string {
  return `₪${Math.round(amount).toLocaleString('en-IL')}`;
}

function getTrustColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function getTrustLabel(score: number): string {
  if (score >= 80) return 'מהימנות גבוהה';
  if (score >= 60) return 'מהימנות בינונית';
  return 'מהימנות נמוכה';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContractorCard({
  match,
  specialties = [],
  priceEstimate,
  available = true,
  yearsInBusiness,
  onRequestQuote,
  onViewProfile,
  className,
}: ContractorCardProps) {
  const trustScore = Math.round(match.overallScore * 100);

  return (
    <div
      className={cn(
        'card flex flex-col gap-4 overflow-hidden',
        'hover:border-primary-200 transition-all duration-200',
        className,
      )}
    >
      {/* ---- Top row: avatar, name, trust score ---- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar / initials */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold text-lg">
            {match.businessName.charAt(0)}
          </div>
          <div className="flex flex-col">
            <h3 className="text-base font-bold text-gray-900 line-clamp-1">
              {match.businessName}
            </h3>
            {/* Star rating */}
            <div className="flex items-center gap-1 mt-0.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3.5 w-3.5',
                      i < Math.round(match.rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-gray-200 text-gray-200',
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500 font-medium">
                {match.rating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Trust score badge */}
        <div
          className={cn(
            'flex flex-col items-center rounded-xl border px-3 py-1.5',
            getTrustColor(trustScore),
          )}
        >
          <div className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" />
            <span className="text-lg font-extrabold">{trustScore}</span>
          </div>
          <span className="text-[10px] font-medium whitespace-nowrap">
            {getTrustLabel(trustScore)}
          </span>
        </div>
      </div>

      {/* ---- Description ---- */}
      {match.description && (
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
          {match.description}
        </p>
      )}

      {/* ---- Specialties tags ---- */}
      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {specialties.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
            >
              <Tag className="h-3 w-3" />
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      )}

      {/* ---- Info row ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {/* Price estimate */}
        {priceEstimate != null && (
          <div className="flex items-center gap-1.5 text-gray-700">
            <span className="font-bold text-primary-600">
              {formatCurrency(priceEstimate)}
            </span>
            <span className="text-xs text-gray-400">הערכת מחיר</span>
          </div>
        )}

        {/* Years in business */}
        {yearsInBusiness != null && (
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs">{yearsInBusiness} שנות ניסיון</span>
          </div>
        )}

        {/* Availability */}
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              available ? 'bg-emerald-500' : 'bg-gray-300',
            )}
          />
          <span
            className={cn(
              'text-xs font-medium',
              available ? 'text-emerald-600' : 'text-gray-400',
            )}
          >
            {available ? 'זמין' : 'לא זמין'}
          </span>
        </div>

        {/* Verified badge */}
        <div className="flex items-center gap-1 text-emerald-600">
          <BadgeCheck className="h-4 w-4" />
          <span className="text-xs font-medium">מאומת</span>
        </div>
      </div>

      {/* ---- Actions ---- */}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onRequestQuote?.(match.contractorId)}
          className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
        >
          <Phone className="h-4 w-4" />
          בקש הצעת מחיר
        </button>
        <button
          type="button"
          onClick={() => onViewProfile?.(match.contractorId)}
          className="btn-secondary flex items-center justify-center gap-1 text-sm"
        >
          פרופיל
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
