import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import ContractorCTA from "@/components/landing/ContractorCTA";
import FeaturedOffers from "@/components/landing/FeaturedOffers";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import LandingFooter from "@/components/landing/LandingFooter";
import TrustSection from "@/components/landing/TrustSection";

const SITE_URL = "https://groupio.co.il";
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Groupio",
  url: SITE_URL,
  description: "פלטפורמת קניות קבוצתיות לבניינים",
  logo: `${SITE_URL}/logo.png`,
};

export const metadata: Metadata = {
  title: "גרופיו | קניות קבוצתיות לבניינים - חסכו עד 40%",
  description:
    "הצטרפו לאלפי דיירים שחוסכים בקניות קבוצתיות. קבלנים מאומתים, תשלום מוגן בנאמנות, עד 40% חיסכון.",
  openGraph: {
    title: "גרופיו | קניות קבוצתיות לבניינים",
    description: "חסכו עד 40% על שירותים לבניין עם קבלנים מאומתים ותשלום מוגן",
    type: "website",
    locale: "he_IL",
    siteName: "Groupio",
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <script type="application/ld+json">
        {JSON.stringify(organizationJsonLd)}
      </script>
      {/* Sticky glassmorphism header */}
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
                href="#how-it-works"
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
        </div>
      </header>

      <HeroSection />
      <HowItWorksSection />
      <FeaturedOffers />
      <TrustSection />
      <ContractorCTA />
      <LandingFooter />
    </div>
  );
}
