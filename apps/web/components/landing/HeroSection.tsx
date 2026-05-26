import { Users, ShieldCheck, BadgeCheck, ArrowLeft, TrendingDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PLATFORM_STATS } from "@/lib/constants/platformStats";

export default async function HeroSection() {
  const t = await getTranslations("landing");

  const TRUST_BADGES = [
    { icon: Users, text: `${PLATFORM_STATS.activeResidents} ${t("stats.activeResidents")}` },
    { icon: ShieldCheck, text: t("hero.trustEscrow") },
    { icon: BadgeCheck, text: `${PLATFORM_STATS.verifiedContractors} ${t("stats.verifiedContractors")}` },
  ];

  return (
    <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-28 px-4 overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(135deg, #093826 0%, #0e5c3a 45%, #1a9a76 100%)",
        }}
      />
      <div
        className="absolute inset-0 -z-10 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle, #ffffff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="max-w-5xl mx-auto">
        <div className="flex justify-center mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide bg-white/10 text-emerald-100 border border-white/20">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-300" />
            {t("hero.badge")}
          </span>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 tracking-tight">
            <span className="text-balance">
              {t("hero.headline")}{" "}
              <span
                style={{
                  background: "linear-gradient(90deg, #6ee7c0, #34d399)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t("hero.headlineHighlight")}
              </span>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-emerald-100/80 max-w-2xl mx-auto leading-relaxed mb-10">
            {t("hero.subtext")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/signup?redirect=/building/join"
              className="inline-flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold text-base px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-900/40 active:scale-[0.98]"
            >
              <span>{t("hero.ctaResident")}</span>
              <ArrowLeft className="h-5 w-5 rtl-flip" />
            </Link>
            <Link
              href="/signup?role=contractor"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-base px-8 py-3.5 rounded-xl border border-white/20 transition-all active:scale-[0.98]"
            >
              {t("hero.ctaContractor")}
            </Link>
          </div>
        </div>

        <div className="max-w-md mx-auto rounded-2xl bg-white p-6 shadow-2xl shadow-black/30">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500">
              {t("hero.sampleLabel")}
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              {t("hero.sampleDiscount")}
            </span>
          </div>

          <h3 className="text-xl font-bold text-slate-900 mb-1">{t("hero.sampleTitle")}</h3>
          <p className="text-sm text-slate-500 mb-5">
            {t("hero.sampleFrom")}
            <span className="font-extrabold text-emerald-600 text-base">
              {t("hero.samplePrice")}
            </span>{" "}
            {t("hero.samplePerUnit")}
          </p>

          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>{t("hero.sampleProgress")}</span>
              <span className="font-semibold text-emerald-600">{t("hero.samplePct")}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all"
                style={{
                  width: "75%",
                  background: "linear-gradient(90deg, #1a9a76, #34d399)",
                }}
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">{t("hero.sampleMore")}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-10">
          {TRUST_BADGES.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.text}
                className="flex items-center gap-2 text-sm text-emerald-100/70"
              >
                <Icon className="h-4 w-4 text-emerald-300" />
                <span dir="ltr">{badge.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
