import { Building2 } from "lucide-react";
import Link from "next/link";

const FOOTER_LINKS = [
  { label: "אודות", href: "/about" },
  { label: "איך זה עובד", href: "#how-it-works" },
  { label: "שאלות נפוצות", href: "/faq" },
  { label: "צור קשר", href: "/contact" },
  { label: "תנאי שימוש", href: "/terms" },
  { label: "מדיניות פרטיות", href: "/privacy" },
];

export default function LandingFooter() {
  return (
    <footer className="py-12 bg-gray-900">
      <div className="max-w-5xl mx-auto px-4">
        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary-400" />
            <span className="text-xl font-bold text-white">Groupio</span>
          </div>
          <p className="text-gray-400 text-sm">
            הפלטפורמה לקנייה קבוצתית חכמה לבניינים
          </p>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mb-8">
          {FOOTER_LINKS.map((link) =>
            link.href.startsWith("#") ? (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            )
          )}
        </nav>

        <div className="border-t border-gray-800 pt-6 text-center">
          <p className="text-gray-500 text-xs">
            כל הזכויות שמורות &copy; 2026 גרופיו
          </p>
        </div>
      </div>
    </footer>
  );
}
