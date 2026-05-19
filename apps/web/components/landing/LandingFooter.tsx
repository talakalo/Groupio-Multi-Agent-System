import { Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";

const FOOTER_LINKS = [
  { label: "אודות", href: "/about" },
  { label: "איך זה עובד", href: "#how-it-works" },
  { label: "שאלות נפוצות", href: "/faq" },
  { label: "צור קשר", href: "/contact" },
  { label: "תנאי שימוש", href: "/terms" },
  { label: "מדיניות פרטיות", href: "/privacy" },
];

const STATS = [
  { value: "5,000+", label: "דיירים פעילים" },
  { value: "200+", label: "קבלנים מאומתים" },
  { value: "₪2M+", label: "נחסכו בסך הכל" },
  { value: "50+", label: "בניינים פעילים" },
];

export default function LandingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      {/* Stats row */}
      <div className="border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-extrabold text-white mb-1">
                  {stat.value}
                </p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          {/* Brand */}
          <div className="flex flex-col gap-4 max-w-xs">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
              <span className="text-xl font-bold text-white">Groupio</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              הפלטפורמה לקנייה קבוצתית חכמה לבניינים בישראל — חוסכים יחד, מרוויחים יחד.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              הצטרפו חינם
              <ArrowLeft className="h-3.5 w-3.5 rtl-flip" />
            </Link>
          </div>

          {/* Links */}
          <nav className="flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((link) =>
              link.href.startsWith("#") ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            כל הזכויות שמורות &copy; 2026 גרופיו
          </p>
          <p className="text-xs text-slate-600">
            נבנה בישראל עם אהבה
          </p>
        </div>
      </div>
    </footer>
  );
}
