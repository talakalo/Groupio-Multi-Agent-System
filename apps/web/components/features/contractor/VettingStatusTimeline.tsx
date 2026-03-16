'use client';

import { CheckCircle2, Clock, XCircle, FileText, Shield, ShieldCheck, Award } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils/cn';

type StepStatus = 'complete' | 'pending' | 'failed' | 'in_progress';

interface VettingStep {
  id: string;
  label: string;
  status: StepStatus;
  date?: string;
  description?: string;
}

interface VettingStatusTimelineProps {
  steps?: VettingStep[];
  className?: string;
}

const STEP_ICONS: Record<string, React.ElementType> = {
  document_submission: FileText,
  license_check: Shield,
  insurance_check: ShieldCheck,
  final_verification: Award,
};

const STEP_KEYS: { id: string; labelKey: string; descKey: string }[] = [
  { id: 'document_submission', labelKey: 'documentSubmission', descKey: 'documentSubmissionDesc' },
  { id: 'license_check', labelKey: 'licenseCheck', descKey: 'licenseCheckDesc' },
  { id: 'insurance_check', labelKey: 'insuranceCheck', descKey: 'insuranceCheckDesc' },
  { id: 'final_verification', labelKey: 'finalVerification', descKey: 'finalVerificationDesc' },
];

const STATUS_CONFIG: Record<StepStatus, { icon: React.ElementType; color: string; bg: string; line: string }> = {
  complete: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', line: 'bg-emerald-400' },
  in_progress: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', line: 'bg-amber-300' },
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-100', line: 'bg-gray-200' },
  failed: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', line: 'bg-red-300' },
};

export function VettingStatusTimeline({ steps: stepsProp, className }: VettingStatusTimelineProps) {
  const t = useTranslations('contractor.profile.vetting');
  const defaultSteps: VettingStep[] = STEP_KEYS.map(({ id, labelKey, descKey }) => ({
    id,
    label: t(labelKey),
    status: 'pending' as const,
    description: t(descKey),
  }));
  const steps = stepsProp ?? defaultSteps;

  return (
    <div className={cn('space-y-0', className)}>
      {steps.map((step, idx) => {
        const config = STATUS_CONFIG[step.status];
        const StatusIcon = config.icon;
        const StepIcon = STEP_ICONS[step.id] ?? FileText;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="relative flex gap-4">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', config.bg)}>
                <StepIcon className={cn('h-5 w-5', config.color)} />
              </div>
              {!isLast && (
                <div className={cn('w-0.5 flex-1 min-h-[2rem]', config.line)} />
              )}
            </div>

            {/* Content */}
            <div className={cn('pb-6', isLast && 'pb-0')}>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900 text-sm">{step.label}</h4>
                <StatusIcon className={cn('h-4 w-4', config.color)} />
                {step.status === 'complete' && (
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {t('statusComplete')}
                  </span>
                )}
                {step.status === 'failed' && (
                  <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    {t('statusFailed')}
                  </span>
                )}
                {step.status === 'in_progress' && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {t('statusInProgress')}
                  </span>
                )}
              </div>
              {step.description && (
                <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
              )}
              {step.date && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(step.date).toLocaleDateString('he-IL')}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
