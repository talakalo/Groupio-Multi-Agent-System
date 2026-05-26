'use client';

import clsx from "clsx";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

interface EscrowBadgeProps {
  variant?: "inline" | "block";
  className?: string;
}

export function EscrowBadge({ variant = "inline", className }: EscrowBadgeProps) {
  const t = useTranslations("escrow");

  if (variant === "block") {
    return (
      <div
        className={clsx(
          "flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-4",
          className
        )}
      >
        <Lock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">{t("protectedTitle")}</p>
          <p className="text-sm text-blue-700 mt-1">{t("protectedDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700",
        className
      )}
    >
      <Lock className="h-3.5 w-3.5" />
      <span>{t("protected")}</span>
    </span>
  );
}
