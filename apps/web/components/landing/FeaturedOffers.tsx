import { Wind, ChefHat, Droplets, BadgeCheck, ArrowLeft, Users, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const OFFER_ICONS: LucideIcon[] = [Wind, ChefHat, Droplets];
const OFFER_STYLES = [
  { iconBg: "bg-sky-50", iconColor: "text-sky-600" },
  { iconBg: "bg-amber-50", iconColor: "text-amber-600" },
  { iconBg: "bg-violet-50", iconColor: "text-violet-600" },
];

export default async function FeaturedOffers() {
  const t = await getTranslations("landing.featuredOffers");

  const OFFERS = [
    {
      icon: OFFER_ICONS[0],
      ...OFFER_STYLES[0],
      title: t("offer1Title"),
      subtitle: t("offer1Subtitle"),
      originalPrice: "₪5,500",
      discountedPrice: "₪3,575",
      savingsPercent: 35,
      participants: 15,
      totalSlots: 22,
      contractor: t("offer1Contractor"),
      daysLeft: 12,
    },
    {
      icon: OFFER_ICONS[1],
      ...OFFER_STYLES[1],
      title: t("offer2Title"),
      subtitle: t("offer2Subtitle"),
      originalPrice: "₪32,000",
      discountedPrice: "₪22,400",
      savingsPercent: 30,
      participants: 12,
      totalSlots: 20,
      contractor: t("offer2Contractor"),
      daysLeft: 8,
    },
    {
      icon: OFFER_ICONS[2],
      ...OFFER_STYLES[2],
      title: t("offer3Title"),
      subtitle: t("offer3Subtitle"),
      originalPrice: "₪4,800",
      discountedPrice: "₪2,880",
      savingsPercent: 40,
      participants: 18,
      totalSlots: 24,
      contractor: t("offer3Contractor"),
      daysLeft: 5,
    },
  ];

  return (
    <section className="py-20 sm:py-24 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold tracking-wide mb-3">
              {t("badge")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              {t("title")}
            </h2>
          </div>
          <Link
            href="/offers"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            {t("viewAll")}
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {OFFERS.map((offer) => {
            const Icon = offer.icon;
            const progress = Math.round((offer.participants / offer.totalSlots) * 100);
            return (
              <Link
                key={offer.title}
                href="/offers"
                className="group rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm hover:shadow-md hover:ring-emerald-200 transition-all flex flex-col p-5"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${offer.iconBg} ${offer.iconColor} group-hover:scale-105 transition-transform`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 mb-0.5 group-hover:text-emerald-700 transition-colors">
                      {offer.title}
                    </h3>
                    <p className="text-xs text-slate-400 leading-snug truncate">{offer.subtitle}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 flex-shrink-0">
                    {offer.savingsPercent}%−
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-4">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{offer.contractor}</span>
                </div>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-xl font-bold text-emerald-700">{offer.discountedPrice}</span>
                  <span className="text-sm text-slate-400 line-through">{offer.originalPrice}</span>
                </div>

                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t("residents", { participants: offer.participants, total: offer.totalSlots })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("days", { days: offer.daysLeft })}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="text-center mt-10 sm:hidden">
          <Link
            href="/offers"
            className="inline-flex items-center gap-2 text-emerald-600 font-semibold hover:text-emerald-700 transition-colors text-sm"
          >
            <span>{t("viewAll")}</span>
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </Link>
        </div>
      </div>
    </section>
  );
}
