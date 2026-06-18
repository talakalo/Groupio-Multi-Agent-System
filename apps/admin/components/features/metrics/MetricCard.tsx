"use client";

import { clsx } from "clsx";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparklinePoint {
  value: number;
}

export interface MetricCardProps {
  /** The label displayed above the metric value */
  label: string;
  /** The primary value to display (pre-formatted string) */
  value: string;
  /** Percentage change compared to previous period */
  changePercent?: number;
  /** Descriptive label for the comparison period */
  changePeriodLabel?: string;
  /** Optional sparkline data points (last N values) */
  sparklineData?: SparklinePoint[];
  /** Visual accent color variant */
  variant?: "default" | "primary" | "success" | "warning" | "danger";
  /** Optional icon to render next to the label */
  icon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Makes the card a clickable link */
  href?: string;
  /** Click handler (alternative to href) */
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<
  NonNullable<MetricCardProps["variant"]>,
  { iconBg: string; iconText: string; accentBar: string }
> = {
  default: {
    iconBg: "bg-surface-100",
    iconText: "text-surface-600",
    accentBar: "bg-surface-200",
  },
  primary: {
    iconBg: "bg-primary-500",
    iconText: "text-white",
    accentBar: "bg-primary-500",
  },
  success: {
    iconBg: "bg-success-500",
    iconText: "text-white",
    accentBar: "bg-success-500",
  },
  warning: {
    iconBg: "bg-warning-500",
    iconText: "text-white",
    accentBar: "bg-warning-500",
  },
  danger: {
    iconBg: "bg-danger-500",
    iconText: "text-white",
    accentBar: "bg-danger-500",
  },
};

/** Render a tiny inline SVG sparkline. */
function Sparkline({ data }: { data: SparklinePoint[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 28;
  const padding = 2;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  // Determine sparkline color based on trend (last vs first)
  const trending = values[values.length - 1] >= values[0];
  const strokeColor = trending ? "#22c55e" : "#ef4444";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-20 h-7 flex-shrink-0"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetricCard({
  label,
  value,
  changePercent,
  changePeriodLabel = "vs last period",
  sparklineData,
  variant = "default",
  icon,
  className,
  href,
  onClick,
}: MetricCardProps) {
  const styles = VARIANT_STYLES[variant];

  const isPositive = changePercent !== undefined && changePercent > 0;
  const isNegative = changePercent !== undefined && changePercent < 0;
  const isNeutral = changePercent !== undefined && changePercent === 0;

  const isClickable = Boolean(href || onClick);

  const content = (
    <>
      {/* Colored accent bar at top */}
      <div className={clsx("absolute inset-x-0 top-0 h-0.5 rounded-t-xl", styles.accentBar)} />

      {/* Header row: icon + arrow */}
      <div className="flex items-start justify-between mb-4">
        {icon && (
          <div
            className={clsx(
              "flex items-center justify-center w-10 h-10 rounded-xl shadow-sm",
              styles.iconBg,
              styles.iconText
            )}
          >
            {icon}
          </div>
        )}
        <div className="flex items-center gap-2">
          {sparklineData && sparklineData.length > 1 && (
            <Sparkline data={sparklineData} />
          )}
          {isClickable && (
            <ArrowUpRight className="w-4 h-4 text-surface-300 group-hover:text-primary-500 transition-colors" />
          )}
        </div>
      </div>

      {/* Value */}
      <p className="text-2xl font-bold text-surface-900 tracking-tight mb-0.5">
        {value}
      </p>

      {/* Label */}
      <span className="text-xs font-medium text-surface-400 uppercase tracking-wide">{label}</span>

      {/* Trend indicator */}
      {changePercent !== undefined && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-surface-100">
          {isPositive && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-success-600">
              <TrendingUp className="w-3.5 h-3.5" />
              +{changePercent.toFixed(1)}%
            </span>
          )}
          {isNegative && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-danger-600">
              <TrendingDown className="w-3.5 h-3.5" />
              {changePercent.toFixed(1)}%
            </span>
          )}
          {isNeutral && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-surface-400">
              <Minus className="w-3.5 h-3.5" />
              0.0%
            </span>
          )}
          <span className="text-xs text-surface-400">{changePeriodLabel}</span>
        </div>
      )}
    </>
  );

  const cardClasses = clsx(
    "card card-hover p-5 group relative overflow-hidden",
    isClickable && "cursor-pointer",
    className
  );

  if (href) {
    return (
      <Link href={href} className={clsx(cardClasses, "block no-underline")}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={clsx(cardClasses, "text-start w-full")}>
        {content}
      </button>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}
