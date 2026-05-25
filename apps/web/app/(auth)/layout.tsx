import { Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthTrustBadges } from "@/components/auth/AuthTrustBadges";

type AuthLayoutProps = {
  children: ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function AuthLayout({ children, params, searchParams }: AuthLayoutProps) {
  if (params) await params;
  if (searchParams) await searchParams;
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      {/* Header — matches landing page */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary-500" />
            <span className="text-2xl font-bold text-primary-600">Groupio</span>
          </Link>
          <nav className="flex items-center gap-6">
            <a
              href="/#how-it-works"
              className="text-gray-600 hover:text-primary-600 transition-colors"
            >
              איך זה עובד
            </a>
            <Link
              href="/offers"
              className="text-gray-600 hover:text-primary-600 transition-colors"
            >
              הצעות
            </Link>
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
      </header>

      {/* Main content — centered, landing-style */}
      <main className="max-w-lg mx-auto px-4 py-12">
        {children}

        {/* Trust badges — compact, matches landing */}
        <AuthTrustBadges />

        {/* Footer */}
        <div className="mt-10 text-center text-sm text-gray-500">
          <p>
            בהתחברות או בהרשמה, אתם מסכימים ל
            <Link href="/terms" className="text-primary-600 hover:underline mx-1">
              תנאי השימוש
            </Link>
            ול
            <Link href="/privacy" className="text-primary-600 hover:underline mx-1">
              מדיניות הפרטיות
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
