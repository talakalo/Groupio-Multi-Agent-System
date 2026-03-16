import Link from "next/link";
import { Users, TrendingUp, BadgeCheck, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ValueProp {
  icon: LucideIcon;
  text: string;
}

const VALUE_PROPS: ValueProp[] = [
  { icon: Users, text: "גישה למאות בניינים ואלפי דיירים פוטנציאליים" },
  { icon: TrendingUp, text: "עסקאות בנפח גבוה עם הכנסה יציבה" },
  { icon: BadgeCheck, text: "תג קבלן מאומת שמגביר אמון לקוחות" },
];

export default function ContractorCTA() {
  return (
    <section className="py-16 sm:py-20 px-4 bg-gradient-to-br from-blue-600 to-blue-700">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          אתם קבלנים?
        </h2>
        <p className="text-blue-100 text-lg mb-8">
          הצטרפו לפלטפורמה והגיעו ללקוחות חדשים בכל יום
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-10">
          {VALUE_PROPS.map((prop) => {
            const Icon = prop.icon;
            return (
              <div
                key={prop.text}
                className="flex items-center gap-2 text-sm text-blue-100"
              >
                <Icon className="h-5 w-5 text-white flex-shrink-0" />
                <span>{prop.text}</span>
              </div>
            );
          })}
        </div>

        <Link
          href="/signup?role=contractor"
          className="inline-flex items-center gap-2 bg-white text-blue-600 hover:bg-blue-50 font-bold text-lg px-8 py-3 rounded-xl transition-all active:scale-[0.98]"
        >
          <span>הצטרפו כקבלן מאומת</span>
          <ArrowLeft className="h-5 w-5 rtl-flip" />
        </Link>
      </div>
    </section>
  );
}
