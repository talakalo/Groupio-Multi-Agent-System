import clsx from "clsx";
import { Shield, Lock, BadgeCheck, FileCheck } from "lucide-react";

type TrustBadge = "verified" | "escrow" | "licensed" | "insured";

interface TrustBadgeClusterProps {
  badges: TrustBadge[];
  layout?: "horizontal" | "vertical";
  size?: "sm" | "md";
  className?: string;
}

const badgeConfig: Record<TrustBadge, { icon: typeof Shield; label: string; color: string }> = {
  verified: { icon: BadgeCheck, label: "קבלן מאומת", color: "text-primary-600 bg-primary-50" },
  escrow: { icon: Lock, label: "תשלום מאובטח", color: "text-blue-600 bg-blue-50" },
  licensed: { icon: FileCheck, label: "בעל רישיון", color: "text-emerald-600 bg-emerald-50" },
  insured: { icon: Shield, label: "מבוטח", color: "text-amber-600 bg-amber-50" },
};

export function TrustBadgeCluster({
  badges,
  layout = "horizontal",
  size = "md",
  className,
}: TrustBadgeClusterProps) {
  const isSmall = size === "sm";

  return (
    <div
      className={clsx(
        "flex gap-2",
        layout === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className
      )}
    >
      {badges.map((badge) => {
        const config = badgeConfig[badge];
        const Icon = config.icon;
        return (
          <div
            key={badge}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full font-medium",
              config.color,
              isSmall ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
            )}
          >
            <Icon className={isSmall ? "h-3 w-3" : "h-4 w-4"} />
            <span>{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
