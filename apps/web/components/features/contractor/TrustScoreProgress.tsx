'use client';

import { TrendingUp, Shield, FileText, Star, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';

interface ScoreCategory {
  label: string;
  score: number;
  maxScore: number;
  icon: React.ElementType;
}

interface TrustScoreProgressProps {
  score: number;
  categories?: ScoreCategory[];
  tips?: string[];
  className?: string;
}

const TIP_KEYS = ['insurance', 'profile', 'response', 'reviews'] as const;
const CATEGORY_KEYS = ['documents', 'insurance', 'rating', 'responseTime'] as const;

function getScoreColor(score: number): { ring: string; text: string; bg: string } {
  if (score >= 80) return { ring: 'text-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (score >= 50) return { ring: 'text-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' };
  return { ring: 'text-red-500', text: 'text-red-700', bg: 'bg-red-50' };
}

export function TrustScoreProgress({
  score,
  categories: categoriesProp,
  tips: tipsProp,
  className,
}: TrustScoreProgressProps) {
  const t = useTranslations('contractor.profile.trustScore');
  const colors = getScoreColor(score);
  const circumference = 2 * Math.PI * 45;
  const progress = (score / 100) * circumference;

  const getScoreLabel = () => {
    if (score >= 80) return t('scoreLabels.excellent');
    if (score >= 50) return t('scoreLabels.good');
    return t('scoreLabels.needsImprovement');
  };

  const defaultCategories: ScoreCategory[] = CATEGORY_KEYS.map((k, i) => {
    const icons = [FileText, Shield, Star, Clock];
    const maxScores = [30, 25, 25, 20];
    return {
      label: t(`categories.${k}`),
      score: 0,
      maxScore: maxScores[i] ?? 0,
      icon: icons[i] ?? FileText,
    };
  });
  const defaultTips = TIP_KEYS.map((k) => t(`tips.${k}`));
  const categories = categoriesProp ?? defaultCategories;
  const tips = tipsProp ?? defaultTips;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Circular progress */}
      <div className="flex items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              className={cn('transition-all duration-1000 ease-out', colors.ring)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-2xl font-bold', colors.text)}>{score}</span>
            <span className="text-xs text-gray-400">/100</span>
          </div>
        </div>

        <div>
          <p className={cn('text-lg font-semibold', colors.text)}>
            {getScoreLabel()}
          </p>
          <p className="text-sm text-gray-500 mt-1">{t('yourTrustScore')}</p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">{t('scoreBreakdown')}</h4>
        {categories.map((cat) => {
          const pct = cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0;
          const Icon = cat.icon;
          return (
            <div key={cat.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                  {cat.label}
                </span>
                <span className="font-medium text-gray-900">{cat.score}/{cat.maxScore}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={cn(
                    'h-2 rounded-full transition-all duration-500',
                    pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Improvement tips */}
      {tips.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary-500" />
            {t('improvementTips')}
          </h4>
          <ul className="space-y-1.5">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary-400 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
