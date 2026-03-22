import { Users, ShieldCheck, BadgeCheck } from "lucide-react";

import {
  PLATFORM_STATS,
  PLATFORM_STATS_LABELS,
} from "@/lib/constants/platformStats";

const TRUST_BADGES = [
  {
    icon: Users,
    text: `${PLATFORM_STATS.activeResidents} ${PLATFORM_STATS_LABELS.activeResidents}`,
  },
  { icon: ShieldCheck, text: "תשלום מוגן בנאמנות" },
  {
    icon: BadgeCheck,
    text: `${PLATFORM_STATS.verifiedContractors} ${PLATFORM_STATS_LABELS.verifiedContractors}`,
  },
];

export function AuthTrustBadges() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
      {TRUST_BADGES.map((badge) => {
        const Icon = badge.icon;
        return (
          <div
            key={badge.text}
            className="flex items-center gap-2 text-sm text-gray-500"
          >
            <Icon className="h-4 w-4 text-primary-500" />
            <span>{badge.text}</span>
          </div>
        );
      })}
    </div>
  );
}
