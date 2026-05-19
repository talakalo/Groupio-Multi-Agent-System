import { Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type ContentLayoutProps = {
  children: ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function ContentLayout({ children, params, searchParams }: ContentLayoutProps) {
  if (params) await params;
  if (searchParams) await searchParams;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--color-canvas, #f7f8f6)" }}>
      {/* Header — same design as auth layout */}
      <header
        style={{
          background: "rgba(247,248,246,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(10,51,41,0.08)",
          boxShadow: "0 1px 0 rgba(10,51,41,0.04)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1a9a76, #105f49)" }}
            >
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ color: "#0f1f1a", letterSpacing: "-0.02em" }}
            >
              Groupio
            </span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/faq"
              className="text-sm font-medium transition-colors hidden sm:block text-gray-500 hover:text-primary-600"
            >
              שאלות נפוצות
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium transition-colors hidden sm:block text-gray-500 hover:text-primary-600"
            >
              צור קשר
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold transition-colors text-gray-700 hover:text-primary-600"
            >
              התחברות
            </Link>
            <Link
              href="/signup"
              className="btn-primary"
              style={{ padding: "0.5rem 1.125rem", fontSize: "0.875rem" }}
            >
              הרשמה חינם
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-10 mt-16" style={{ background: "#0f1f1a" }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary-400" />
              <span className="text-lg font-bold text-white">Groupio</span>
            </div>
            <p className="text-sm" style={{ color: "#9aadaa" }}>
              הפלטפורמה לקנייה קבוצתית חכמה לבניינים
            </p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-6">
            {[
              { label: "תנאי שימוש", href: "/terms" },
              { label: "מדיניות פרטיות", href: "/privacy" },
              { label: "שאלות נפוצות", href: "/faq" },
              { label: "צור קשר", href: "/contact" },
              { label: "דף הבית", href: "/" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm transition-colors"
                style={{ color: "#9aadaa" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div
            className="border-t pt-5 text-center text-xs"
            style={{ borderColor: "rgba(255,255,255,0.08)", color: "#6b8c7a" }}
          >
            © 2026 גרופיו — כל הזכויות שמורות
          </div>
        </div>
      </footer>
    </div>
  );
}
