import { Lock } from "lucide-react";
import clsx from "clsx";

interface EscrowBadgeProps {
  variant?: "inline" | "block";
  className?: string;
}

export function EscrowBadge({ variant = "inline", className }: EscrowBadgeProps) {
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
          <p className="text-sm font-semibold text-blue-800">תשלום מוגן בנאמנות</p>
          <p className="text-sm text-blue-700 mt-1">
            הכסף שלך מוחזק בחשבון נאמנות מאובטח ומשוחרר לקבלן רק לאחר
            השלמת העבודה לשביעות רצונך
          </p>
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
      <span>תשלום מוגן</span>
    </span>
  );
}
