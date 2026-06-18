import { Users, TrendingUp, BadgeCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

const VALUE_ICONS: LucideIcon[] = [Users, TrendingUp, BadgeCheck];

export default async function ContractorCTA() {
  const t = await getTranslations("landing.contractorCTA");

  const VALUE_PROPS = [
    { icon: VALUE_ICONS[0], title: t("value1Title"), text: t("value1Text") },
    { icon: VALUE_ICONS[1], title: t("value2Title"), text: t("value2Text") },
    { icon: VALUE_ICONS[2], title: t("value3Title"), text: t("value3Text") },
  ];

  const PROCESS_STEPS = [t("step1"), t("step2"), t("step3")];

  return (
    <section className="py-20 sm:py-24 px-4 relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{ background: "linear-gradient(135deg, #093826 0%, #0e5c3a 50%, #147a5e 100%)" }}
      />
      <div
        className="absolute inset-0 -z-10 opacity-5"
        style={{
          backgroundImage: "radial-gradient(circle, #ffffff 1.5px, transparent 1.5px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-emerald-200 text-xs font-semibold tracking-wide mb-5 border border-white/20">
              {t("badge")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-5 leading-tight tracking-tight">
              {t("title")}<br />
              <span className="text-emerald-300">{t("titleHighlight")}</span>
            </h2>
            <p className="text-emerald-100/80 text-base mb-8 leading-relaxed">
              {t("subtext")}
            </p>

            <div className="space-y-3 mb-8">
              {PROCESS_STEPS.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300 flex-shrink-0" />
                  <span className="text-sm text-emerald-100">{step}</span>
                </div>
              ))}
            </div>

            <Link
              href="/signup?role=contractor"
              className="inline-flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold text-base px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-black/20 active:scale-[0.98]"
            >
              <span>{t("cta")}</span>
              <ArrowLeft className="h-5 w-5 rtl-flip" />
            </Link>
          </div>

          <div className="space-y-4">
            {VALUE_PROPS.map((prop) => {
              const Icon = prop.icon;
              return (
                <div
                  key={prop.title}
                  className="flex items-start gap-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-5 hover:bg-white/15 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-emerald-200" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm mb-0.5">{prop.title}</p>
                    <p className="text-sm text-emerald-100/70">{prop.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
