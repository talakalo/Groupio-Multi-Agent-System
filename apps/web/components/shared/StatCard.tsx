'use client';

import { TrendingUp, TrendingDown, Briefcase, CheckCircle, DollarSign, Star } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatCardProps {
  /** Stat label / title (alias: label) */
  title?: string;
  /** Stat label / title (alias: title) */
  label?: string;
  /** Formatted display value */
  value: string | number;
  /** Change percentage string, e.g. "+12%" or "-5%" */
  change?: string;
  /** Trend as a number (will be formatted as +X% or -X%) */
  trend?: number;
  /** Optional icon displayed at the top of the card - can be ReactNode or icon name */
  icon?: React.ReactNode | string;
  /** Optional suffix after the value */
  suffix?: string;
  /** Optional sparkline data points for a mini area chart */
  sparklineData?: number[];
  /** Additional CSS class names */
  className?: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  briefcase: <Briefcase className="h-5 w-5" />,
  'check-circle': <CheckCircle className="h-5 w-5" />,
  currency: <DollarSign className="h-5 w-5" />,
  star: <Star className="h-5 w-5" />,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPositive(change: string): boolean {
  return change.startsWith('+');
}

function isNegative(change: string): boolean {
  return change.startsWith('-');
}

/**
 * Renders a minimal SVG sparkline area chart.
 */
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;

  const width = 80;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(' L')}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const color = positive ? '#22c55e' : '#ef4444';
  const fillColor = positive ? '#22c55e20' : '#ef444420';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatCard({
  title,
  label,
  value,
  change,
  trend,
  icon,
  suffix,
  sparklineData,
  className,
}: StatCardProps) {
  // Support both title and label props
  const displayTitle = title ?? label ?? '';

  // Support both change (string) and trend (number) props
  const displayChange = change ?? (trend !== undefined ? `${trend >= 0 ? '+' : ''}${trend}%` : undefined);

  const positive = displayChange ? isPositive(displayChange) : undefined;
  const negative = displayChange ? isNegative(displayChange) : undefined;

  // Support both ReactNode and string icons
  const renderIcon = typeof icon === 'string' ? ICON_MAP[icon] : icon;

  return (
    <div
      className={cn(
        'card flex flex-col gap-3',
        className,
      )}
    >
      {/* ---- Header row ---- */}
      <div className="flex items-center justify-between">
        {renderIcon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            {renderIcon}
          </div>
        )}

        {/* Sparkline on the end side */}
        {sparklineData && sparklineData.length >= 2 && (
          <Sparkline data={sparklineData} positive={positive ?? true} />
        )}
      </div>

      {/* ---- Value ---- */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray-500">{displayTitle}</span>
        <span className="text-2xl font-bold text-gray-900">
          {value}{suffix && <span className="text-lg text-gray-500">{suffix}</span>}
        </span>
      </div>

      {/* ---- Change badge ---- */}
      {displayChange && (
        <div className="flex items-center gap-1.5">
          {positive && <TrendingUp className="h-4 w-4 text-emerald-500" />}
          {negative && <TrendingDown className="h-4 w-4 text-red-500" />}
          <span
            className={cn(
              'text-sm font-semibold',
              positive && 'text-emerald-600',
              negative && 'text-red-600',
              !positive && !negative && 'text-gray-500',
            )}
          >
            {displayChange}
          </span>
        </div>
      )}
    </div>
  );
}
