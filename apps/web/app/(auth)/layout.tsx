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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Header */}
      <header
        style={{
          background: 'rgba(247,248,246,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(10,51,41,0.08)',
          boxShadow: '0 1px 0 rgba(10,51,41,0.04)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a9a76, #105f49)' }}>
              <Building2 className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: '#0f1f1a', letterSpacing: '-0.02em' }}>Groupio</span>
          </Link>
          <nav className="flex items-center gap-5">
            <a
              href="/#how-it-works"
              className="text-sm font-medium transition-colors hidden sm:block"
              style={{ color: '#4a6154' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#1a9a76'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#4a6154'; }}
            >
              איך זה עובד
            </a>
            <Link
              href="/offers"
              className="text-sm font-medium transition-colors hidden sm:block"
              style={{ color: '#4a6154' }}
            >
              הצעות
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold transition-colors"
              style={{ color: '#1f2d27' }}
            >
              התחברות
            </Link>
            <Link href="/signup" className="btn-primary" style={{ padding: '0.5rem 1.125rem', fontSize: '0.875rem' }}>
              הרשמה חינם
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-md mx-auto px-4 py-12">
        {children}
        <AuthTrustBadges />
        <div className="mt-10 text-center text-sm" style={{ color: '#9aadaa' }}>
          <p>
            בהתחברות או בהרשמה, אתם מסכימים ל
            <Link href="/terms" className="font-medium hover:underline mx-1" style={{ color: '#1a9a76' }}>
              תנאי השימוש
            </Link>
            ול
            <Link href="/privacy" className="font-medium hover:underline mx-1" style={{ color: '#1a9a76' }}>
              מדיניות הפרטיות
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
