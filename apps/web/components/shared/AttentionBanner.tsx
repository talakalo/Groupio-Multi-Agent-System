"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";

type BannerVariant = "warning" | "error" | "info";

interface AttentionBannerProps {
  variant?: BannerVariant;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
  action?: { label: string; onClick: () => void };
}

const variantConfig: Record<BannerVariant, { icon: typeof Info; bg: string; border: string; text: string }> = {
  warning: { icon: AlertTriangle, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
  error: { icon: AlertCircle, bg: "bg-red-50", border: "border-red-200", text: "text-red-800" },
  info: { icon: Info, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800" },
};

export function AttentionBanner({
  variant = "info",
  title,
  children,
  dismissible = true,
  className,
  action,
}: AttentionBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const t = useTranslations("common");
  if (dismissed) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-lg border p-4",
        config.bg,
        config.border,
        className
      )}
      role="alert"
    >
      <Icon className={clsx("h-5 w-5 shrink-0 mt-0.5", config.text)} />
      <div className="flex-1 min-w-0">
        {title && <p className={clsx("font-semibold text-sm", config.text)}>{title}</p>}
        <div className={clsx("text-sm", config.text, title && "mt-1")}>{children}</div>
        {action && (
          <button
            onClick={action.onClick}
            className={clsx("mt-2 text-sm font-medium underline underline-offset-2", config.text)}
          >
            {action.label}
          </button>
        )}
      </div>
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className={clsx("shrink-0 p-1 rounded hover:bg-black/5", config.text)}
          aria-label={t("close")}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
