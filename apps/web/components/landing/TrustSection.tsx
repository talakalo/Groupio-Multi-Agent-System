import { ShieldCheck, Lock, Eye, Headphones } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TrustCard {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
}

const TRUST_CARDS: TrustCard[] = [
  {
    icon: ShieldCheck,
    color: "bg-primary-100 text-primary-600",
    title: "קבלנים מאומתים",
    description:
      "כל קבלן עובר בדיקת רישיון, ביטוח ורקע לפני שהוא מתקבל לפלטפורמה.",
  },
  {
    icon: Lock,
    color: "bg-accent-100 text-accent-600",
    title: "תשלום מוגן בנאמנות",
    description:
      "הכסף שלכם מוחזק בחשבון נאמנות ומשוחרר לקבלן רק לאחר סיום העבודה.",
  },
  {
    icon: Eye,
    color: "bg-info-100 text-info-600",
    title: "מחירים שקופים",
    description:
      "ללא עמלות נסתרות. תמחור מדורג לפי מספר המשתתפים — מה שאתם רואים זה מה שאתם משלמים.",
  },
  {
    icon: Headphones,
    color: "bg-success-100 text-success-600",
    title: "תמיכה מלאה",
    description:
      "עוזר AI חכם זמין בכל שלב, עם אפשרות להעברה לנציג אנושי בכל רגע.",
  },
];

export default function TrustSection() {
  return (
    <section className="py-16 sm:py-20 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
          למה לסמוך על גרופיו?
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {TRUST_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="card flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${card.color}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{card.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
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
