import { Building2, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PLATFORM_STATS } from "@/lib/constants/platformStats";

export default async function LandingFooter() {
  const t = await getTranslations("landing");

  const FOOTER_LINKS = [
    { label: t("footer.about"), href: "/about" },
    { label: t("footer.howItWorks"), href: "#how-it-works" },
    { label: t("footer.faq"), href: "/faq" },
    { label: t("footer.contact"), href: "/contact" },
    { label: t("footer.terms"), href: "/terms" },
    { label: t("footer.privacy"), href: "/privacy" },
  ];

  const STATS = [
    { value: PLATFORM_STATS.activeResidents, label: t("stats.activeResidents") },
    { value: PLATFORM_STATS.verifiedContractors, label: t("stats.verifiedContractors") },
    { value: PLATFORM_STATS.totalSaved, label: t("stats.totalSaved") },
    { value: "50+", label: t("stats.activeBuildings") },
  ] as const;

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-5xl mx-auto px-4 pt-14 pb-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10 mb-12">
          <div className="flex flex-col gap-4 max-w-xs">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
              <span className="text-xl font-bold text-white">Groupio</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t("footer.tagline")}
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {t("footer.joinFree")}
              <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
            </Link>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) =>
              link.href.startsWith("#") ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-8 border-y border-slate-800 mb-8 text-center">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-extrabold text-white mb-1 tabular-nums" dir="ltr">
                {stat.value}
              </p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">{t("footer.copyright")}</p>
          <p className="text-xs text-slate-600">{t("footer.madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
