import { ShieldCheck, Lock, Eye, Headphones } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TrustCard {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

const TRUST_CARDS: TrustCard[] = [
  {
    icon: ShieldCheck,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    title: "קבלנים מאומתים",
    description:
      "כל קבלן עובר בדיקת רישיון, ביטוח ורקע לפני שהוא מתקבל לפלטפורמה.",
  },
  {
    icon: Lock,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    title: "תשלום מוגן בנאמנות",
    description:
      "הכסף שלכם מוחזק בחשבון נאמנות ומשוחרר לקבלן רק לאחר סיום העבודה.",
  },
  {
    icon: Eye,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "מחירים שקופים",
    description:
      "ללא עמלות נסתרות. תמחור מדורג לפי מספר המשתתפים — מה שאתם רואים זה מה שאתם משלמים.",
  },
  {
    icon: Headphones,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    title: "תמיכה מלאה",
    description:
      "עוזר AI חכם זמין בכל שלב, עם אפשרות להעברה לנציג אנושי בכל רגע.",
  },
];

export default function TrustSection() {
  return (
    <section className="py-20 sm:py-24 px-4" style={{ background: "#f7f8f6" }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white text-slate-600 text-xs font-semibold tracking-wide mb-4 shadow-sm ring-1 ring-slate-100">
            הבטחת Groupio
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            למה לסמוך על גרופיו?
          </h2>
          <p className="mt-3 text-slate-500 text-base max-w-xl mx-auto">
            בנינו את הפלטפורמה עם שקיפות ואמון בלב — כך שתוכלו לחסוך בלי לדאוג
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
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${card.iconBg} ${card.iconColor}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1.5">{card.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
