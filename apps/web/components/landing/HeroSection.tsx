import { Users, ShieldCheck, BadgeCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

const TRUST_BADGES = [
  { icon: Users, text: "3,200+ דיירים פעילים" },
  { icon: ShieldCheck, text: "תשלום מוגן בנאמנות" },
  { icon: BadgeCheck, text: "קבלנים מאומתים בלבד" },
];

export default function HeroSection() {
  return (
    <section className="pt-28 pb-16 sm:pt-32 sm:pb-20 px-4 bg-gradient-to-b from-primary-50 to-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
            <span className="text-balance">
              הדיירים בבניין שלך כבר חוסכים{" "}
              <span className="text-primary-500">אלפי שקלים</span>
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
            גרופיו מאגדת דיירים מאותו בניין לקנייה קבוצתית של שירותי תחזוקה
            ושיפוצים — וככל שיותר שכנים מצטרפים, המחיר יורד לכולם.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <Link
              href="/signup"
              className="btn-primary text-lg px-8 py-3 flex items-center gap-2"
            >
              <span>הצטרפו לבניין שלכם</span>
              <ArrowLeft className="h-5 w-5 rtl-flip" />
            </Link>
            <Link
              href="/signup?role=contractor"
              className="btn-outline text-lg px-8 py-3"
            >
              אני קבלן
            </Link>
          </div>
        </div>

        {/* Savings example card */}
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">דוגמת חיסכון</span>
            <span className="badge-success text-xs">40% הנחה</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">איטום גג</h3>
          <p className="text-sm text-gray-500 mb-4">
            מ-₪4,800 ל-<span className="font-bold text-primary-600">₪2,880</span>{" "}
            לדירה
          </p>

          {/* Participants progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>18 מתוך 24 דיירים הצטרפו</span>
              <span>75%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="bg-primary-500 h-2.5 rounded-full transition-all"
                style={{ width: "75%" }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">עוד 6 דיירים לשלב ההנחה הבא</p>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-10">
          {TRUST_BADGES.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.text}
                className="flex items-center gap-2 text-sm text-gray-500"
              >
                <Icon className="h-4 w-4 text-primary-500" />
                <span>{badge.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
