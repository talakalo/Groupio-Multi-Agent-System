import { Building2, ShoppingBag, CreditCard, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Step {
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    number: 1,
    icon: Building2,
    title: "הצטרפו לבניין",
    description: "הירשמו וצרפו את הבניין שלכם תוך דקה. הזמינו את השכנים להצטרף.",
  },
  {
    number: 2,
    icon: ShoppingBag,
    title: "בחרו הצעה קבוצתית",
    description: "עיינו בהצעות מקבלנים מאומתים והצטרפו לעסקה הקבוצתית שמתאימה לכם.",
  },
  {
    number: 3,
    icon: CreditCard,
    title: "שלמו וחסכו",
    description: "שלמו בצורה מאובטחת דרך חשבון נאמנות — הכסף משוחרר רק לאחר ביצוע העבודה.",
  },
];

const STEP_COLORS = [
  { bg: "bg-emerald-50", icon: "text-emerald-600", badge: "bg-emerald-500", line: "bg-emerald-100" },
  { bg: "bg-sky-50", icon: "text-sky-600", badge: "bg-sky-500", line: "bg-sky-100" },
  { bg: "bg-violet-50", icon: "text-violet-600", badge: "bg-violet-500", line: "bg-violet-100" },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 sm:py-24 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold tracking-wide mb-4">
            שלושה שלבים פשוטים
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
            איך זה עובד?
          </h2>
          <p className="mt-3 text-slate-500 text-base max-w-xl mx-auto">
            מההרשמה ועד לחיסכון האמיתי — תהליך פשוט ושקוף לחלוטין
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-10 right-[calc(16.67%+2rem)] left-[calc(16.67%+2rem)] h-px bg-gradient-to-l from-violet-100 via-sky-100 to-emerald-100" />

          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const colors = STEP_COLORS[idx];
            return (
              <div
                key={step.number}
                className="relative flex flex-col items-center text-center"
              >
                {/* Icon circle */}
                <div className="relative z-10 mb-6">
                  <div
                    className={`w-20 h-20 rounded-2xl ${colors.bg} flex items-center justify-center shadow-sm ring-1 ring-slate-100`}
                  >
                    <Icon className={`h-9 w-9 ${colors.icon}`} />
                  </div>
                  <span
                    className={`absolute -top-2.5 -end-2.5 w-7 h-7 rounded-full ${colors.badge} text-white text-xs font-bold flex items-center justify-center shadow-md`}
                  >
                    {step.number}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA below steps */}
        <div className="text-center mt-14">
          <a
            href="/signup"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-7 py-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            <span>התחילו לחסוך עכשיו</span>
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </a>
        </div>
      </div>
    </section>
  );
}
