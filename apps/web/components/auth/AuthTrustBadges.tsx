import { Users, ShieldCheck, BadgeCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PLATFORM_STATS } from "@/lib/constants/platformStats";

export async function AuthTrustBadges() {
  const tStats = await getTranslations("landing.stats");
  const tAuth = await getTranslations("auth.trustBadges");

  const TRUST_BADGES = [
    { icon: Users, text: `${PLATFORM_STATS.activeResidents} ${tStats("activeResidents")}` },
    { icon: ShieldCheck, text: tAuth("escrow") },
    { icon: BadgeCheck, text: `${PLATFORM_STATS.verifiedContractors} ${tStats("verifiedContractors")}` },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 mt-8">
      {TRUST_BADGES.map((badge) => {
        const Icon = badge.icon;
        return (
          <div key={badge.text} className="flex items-center gap-2 text-sm text-gray-500">
            <Icon className="h-4 w-4 text-primary-500" />
            <span dir="ltr">{badge.text}</span>
          </div>
        );
      })}
    </div>
  );
}
