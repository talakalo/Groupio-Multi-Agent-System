import { Building2, ShoppingBag, CreditCard, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

const STEP_COLORS = [
  { bg: "bg-emerald-50", icon: "text-emerald-600", badge: "bg-emerald-500" },
  { bg: "bg-sky-50", icon: "text-sky-600", badge: "bg-sky-500" },
  { bg: "bg-violet-50", icon: "text-violet-600", badge: "bg-violet-500" },
];

const STEP_ICONS: LucideIcon[] = [Building2, ShoppingBag, CreditCard];

export default async function HowItWorksSection() {
  const t = await getTranslations("landing.howItWorks");

  const STEPS = [
    { number: 1, icon: STEP_ICONS[0], title: t("step1Title"), description: t("step1Description") },
    { number: 2, icon: STEP_ICONS[1], title: t("step2Title"), description: t("step2Description") },
    { number: 3, icon: STEP_ICONS[2], title: t("step3Title"), description: t("step3Description") },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-24 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold tracking-wide mb-4">
            {t("badgeLabel")}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-3 text-slate-500 text-base max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          <div className="hidden md:block absolute top-10 right-[calc(16.67%+2rem)] left-[calc(16.67%+2rem)] h-px bg-gradient-to-l from-violet-100 via-sky-100 to-emerald-100" />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const colors = STEP_COLORS[idx];
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 mb-6">
                  <div className={`w-20 h-20 rounded-2xl ${colors.bg} flex items-center justify-center shadow-sm ring-1 ring-slate-100`}>
                    <Icon className={`h-9 w-9 ${colors.icon}`} />
                  </div>
                  <span className={`absolute -top-2.5 -end-2.5 w-7 h-7 rounded-full ${colors.badge} text-white text-xs font-bold flex items-center justify-center shadow-md`}>
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-xs">{step.description}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-14">
          <a
            href="/signup?redirect=/building/join"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-7 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            <span>{t("cta")}</span>
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </a>
        </div>
      </div>
    </section>
  );
}
