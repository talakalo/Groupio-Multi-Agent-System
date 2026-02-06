import Link from "next/link";
import {
  Users,
  TrendingDown,
  Shield,
  MessageSquare,
  ArrowLeft,
  Building2,
  Star,
} from "lucide-react";

const VALUE_PROPS = [
  {
    icon: Users,
    title: "כוח קנייה קבוצתי",
    description:
      "אחדו כוחות עם השכנים שלכם וקבלו הנחות משמעותיות על שירותים לבניין. ככל שיותר שכנים מצטרפים, המחיר יורד.",
  },
  {
    icon: TrendingDown,
    title: "חיסכון של עד 40%",
    description:
      "מערכת התמחור החכמה שלנו מנתחת את השוק ומבטיחה שתקבלו את המחיר הטוב ביותר עבור כל שירות.",
  },
  {
    icon: Shield,
    title: "קבלנים מאומתים",
    description:
      "כל הקבלנים עוברים תהליך אימות קפדני הכולל בדיקת רישיון, ביטוח ודירוגים מדיירים אחרים.",
  },
  {
    icon: MessageSquare,
    title: "עוזר AI חכם",
    description:
      "הצ׳אטבוט החכם שלנו עוזר לכם למצוא קבלנים, להשוות מחירים ולנהל את כל התהליך בקלות.",
  },
];

const STATS = [
  { value: "2,500+", label: "דיירים פעילים" },
  { value: "350+", label: "קבלנים מאומתים" },
  { value: "40%", label: "חיסכון ממוצע" },
  { value: "180+", label: "בניינים" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-white">
      {/* Header */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Building2 className="h-8 w-8 text-primary-500" />
              <span className="text-2xl font-bold text-primary-600">
                Groupio
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-gray-600 hover:text-primary-600 transition-colors"
              >
                איך זה עובד
              </a>
              <a
                href="#stats"
                className="text-gray-600 hover:text-primary-600 transition-colors"
              >
                מספרים
              </a>
              <Link
                href="/login"
                className="text-gray-700 font-medium hover:text-primary-600 transition-colors"
              >
                התחברות
              </Link>
              <Link href="/signup" className="btn-primary">
                הרשמה חינם
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 rounded-full px-4 py-2 text-sm font-medium mb-6">
            <Star className="h-4 w-4" />
            <span>הפלטפורמה המובילה לקניות קבוצתיות לבניינים</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            <span className="text-balance">
              חסכו ביחד עם{" "}
              <span className="text-primary-500">השכנים שלכם</span>
            </span>
          </h1>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Groupio מחברת בין דיירי בניינים לקבלנים מאומתים, ומאפשרת לכם ליהנות
            מהנחות קבוצתיות משמעותיות על שירותי תחזוקה ושיפוצים.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="btn-primary text-lg px-8 py-3 flex items-center gap-2"
            >
              <span>התחילו לחסוך</span>
              <ArrowLeft className="h-5 w-5 rtl-flip" />
            </Link>
            <Link
              href="/login"
              className="btn-secondary text-lg px-8 py-3"
            >
              כבר יש לי חשבון
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-16 bg-primary-500">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-white mb-2">
                  {stat.value}
                </div>
                <div className="text-primary-100 text-sm sm:text-base">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              למה Groupio?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              אנחנו מספקים את הכלים החכמים ביותר כדי שתוכלו לחסוך כסף ולקבל שירות
              מעולה
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {VALUE_PROPS.map((prop) => {
              const Icon = prop.icon;
              return (
                <div
                  key={prop.title}
                  className="card group hover:border-primary-200"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-500 transition-colors">
                      <Icon className="h-6 w-6 text-primary-600 group-hover:text-white transition-colors" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {prop.title}
                      </h3>
                      <p className="text-gray-600 leading-relaxed">
                        {prop.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-primary-500 to-accent-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            מוכנים להתחיל לחסוך?
          </h2>
          <p className="text-xl text-primary-100 mb-10">
            הצטרפו לאלפי דיירים שכבר חוסכים עם Groupio.
            ההרשמה חינם ולוקחת פחות מדקה.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-white text-primary-600 hover:bg-primary-50 font-bold text-lg px-8 py-3 rounded-xl transition-all"
            >
              הרשמה חינם
            </Link>
            <Link
              href="/signup?role=contractor"
              className="border-2 border-white text-white hover:bg-white/10 font-medium text-lg px-8 py-3 rounded-xl transition-all"
            >
              אני קבלן
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary-400" />
              <span className="text-xl font-bold text-white">Groupio</span>
            </div>
            <p className="text-gray-400 text-sm">
              &copy; {new Date().getFullYear()} Groupio. כל הזכויות שמורות.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
