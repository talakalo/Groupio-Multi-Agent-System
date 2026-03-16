import { Building2, ShoppingBag, CreditCard } from "lucide-react";
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

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-14">
          איך זה עובד?
        </h2>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-10 right-[16.67%] left-[16.67%] h-0.5 bg-primary-100" />

          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 w-16 h-16 rounded-full bg-primary-50 border-2 border-primary-200 flex items-center justify-center mb-5">
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
                    {step.number}
                  </span>
                  <Icon className="h-7 w-7 text-primary-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
