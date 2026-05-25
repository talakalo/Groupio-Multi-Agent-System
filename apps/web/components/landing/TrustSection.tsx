import { ShieldCheck, Lock, Eye, Headphones } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

const CARD_ICONS: LucideIcon[] = [ShieldCheck, Lock, Eye, Headphones];
const CARD_STYLES = [
  { iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { iconBg: "bg-sky-50", iconColor: "text-sky-600" },
  { iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  { iconBg: "bg-amber-50", iconColor: "text-amber-600" },
];

export default async function TrustSection() {
  const t = await getTranslations("landing.trust");

  const TRUST_CARDS = [
    { icon: CARD_ICONS[0], ...CARD_STYLES[0], title: t("card1Title"), description: t("card1Description") },
    { icon: CARD_ICONS[1], ...CARD_STYLES[1], title: t("card2Title"), description: t("card2Description") },
    { icon: CARD_ICONS[2], ...CARD_STYLES[2], title: t("card3Title"), description: t("card3Description") },
    { icon: CARD_ICONS[3], ...CARD_STYLES[3], title: t("card4Title"), description: t("card4Description") },
  ];

  return (
    <section className="py-20 sm:py-24 px-4" style={{ background: "#f7f8f6" }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white text-slate-600 text-xs font-semibold tracking-wide mb-4 shadow-sm ring-1 ring-slate-100">
            {t("badgeLabel")}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-3 text-slate-500 text-base max-w-xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {TRUST_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 flex items-start gap-4 hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${card.iconBg} ${card.iconColor}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1.5">{card.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
