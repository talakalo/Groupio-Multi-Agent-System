import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthTrustBadges } from "@/components/auth/AuthTrustBadges";

type AuthLayoutProps = {
  children: ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function AuthLayout({ children, params, searchParams }: AuthLayoutProps) {
  if (params) await params;
  if (searchParams) await searchParams;
  const t = await getTranslations("auth.layout");
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-canvas)' }}>
      <AuthHeader />
      <main className="max-w-md mx-auto px-4 py-12">
        {children}
        <AuthTrustBadges />
        <div className="mt-10 text-center text-sm" style={{ color: '#9aadaa' }}>
          <p>
            {t("tosAgreement")}{" "}
            <Link href="/terms" className="font-medium hover:underline mx-1 text-primary-600">
              {t("terms")}
            </Link>
            {t("and")}{" "}
            <Link href="/privacy" className="font-medium hover:underline mx-1 text-primary-600">
              {t("privacy")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
