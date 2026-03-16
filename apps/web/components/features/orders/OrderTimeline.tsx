"use client";

import { Check } from "lucide-react";
import clsx from "clsx";

interface TimelineStep {
  key: string;
  label: string;
  date?: string;
}

type StepStatus = "complete" | "current" | "upcoming";

interface OrderTimelineProps {
  status: string;
  dates?: Record<string, string>;
  className?: string;
}

const STEPS: TimelineStep[] = [
  { key: "created", label: "הזמנה נוצרה" },
  { key: "paid", label: "תשלום התקבל" },
  { key: "contractor", label: "קבלן אושר" },
  { key: "in_progress", label: "עבודה בביצוע" },
  { key: "completed", label: "עבודה הושלמה" },
];

const STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  processing: 1,
  succeeded: 2,
  released: 4,
  refunded: -1,
  failed: -1,
};

function getStepStatus(index: number, activeStep: number): StepStatus {
  if (activeStep < 0) return index === 0 ? "current" : "upcoming";
  if (index < activeStep) return "complete";
  if (index === activeStep) return "current";
  return "upcoming";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrderTimeline({ status, dates, className }: OrderTimelineProps) {
  const activeStep = STATUS_TO_STEP[status] ?? 0;

  return (
    <div className={clsx("relative", className)}>
      <ol className="space-y-0">
        {STEPS.map((step, index) => {
          const stepStatus = getStepStatus(index, activeStep);
          const dateStr = dates?.[step.key];
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.key} className="relative flex gap-3">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className={clsx(
                    "absolute start-[15px] top-8 w-0.5 h-[calc(100%-8px)]",
                    stepStatus === "complete" ? "bg-primary-500" : "bg-gray-200"
                  )}
                  aria-hidden="true"
                />
              )}

              {/* Circle indicator */}
              <div
                className={clsx(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  stepStatus === "complete" && "bg-primary-500 text-white",
                  stepStatus === "current" && "bg-primary-100 text-primary-700 ring-2 ring-primary-500",
                  stepStatus === "upcoming" && "bg-gray-100 text-gray-400"
                )}
              >
                {stepStatus === "complete" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>

              {/* Label + date */}
              <div className="pb-6 pt-1 min-w-0">
                <p
                  className={clsx(
                    "text-sm font-medium",
                    stepStatus === "complete" && "text-gray-900",
                    stepStatus === "current" && "text-primary-700",
                    stepStatus === "upcoming" && "text-gray-400"
                  )}
                >
                  {step.label}
                </p>
                {dateStr && (
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(dateStr)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
