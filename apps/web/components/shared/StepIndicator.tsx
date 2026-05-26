"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface Step {
  label: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  variant?: "circles" | "bar";
  className?: string;
}

export function StepIndicator({ steps, currentStep, variant = "circles", className }: StepIndicatorProps) {
  const t = useTranslations("common");
  if (variant === "bar") {
    const pct = steps.length > 0 ? ((currentStep + 1) / steps.length) * 100 : 0;
    return (
      <nav aria-label="Progress" className={className}>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center">
          {t("stepOf", { current: currentStep + 1, total: steps.length })}
        </p>
      </nav>
    );
  }

  return (
    <nav aria-label="Progress" className={className}>
      {/* Horizontal layout for desktop */}
      <ol className="hidden sm:flex items-center gap-4">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <li key={index} className="flex items-center gap-3">
              {index > 0 && (
                <div
                  className={clsx(
                    "h-0.5 w-8",
                    isComplete ? "bg-primary-500" : "bg-gray-200"
                  )}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                    isComplete && "bg-primary-500 text-white",
                    isCurrent && "bg-primary-100 text-primary-700 ring-2 ring-primary-500",
                    !isComplete && !isCurrent && "bg-gray-100 text-gray-400"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <div>
                  <p
                    className={clsx(
                      "text-sm font-medium",
                      isCurrent ? "text-primary-700" : isComplete ? "text-gray-900" : "text-gray-400"
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Vertical layout for mobile */}
      <ol className="sm:hidden space-y-4">
        {steps.map((step, index) => {
          const isComplete = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <li key={index} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    isComplete && "bg-primary-500 text-white",
                    isCurrent && "bg-primary-100 text-primary-700 ring-2 ring-primary-500",
                    !isComplete && !isCurrent && "bg-gray-100 text-gray-400"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={clsx(
                      "w-0.5 h-6 mt-1",
                      isComplete ? "bg-primary-500" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
              <div className="pt-1">
                <p
                  className={clsx(
                    "text-sm font-medium",
                    isCurrent ? "text-primary-700" : isComplete ? "text-gray-900" : "text-gray-400"
                  )}
                >
                  {step.label}
                </p>
                {step.description && isCurrent && (
                  <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
