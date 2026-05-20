import type { Metadata } from "next";

import ContractorCTA from "@/components/landing/ContractorCTA";
import FeaturedOffers from "@/components/landing/FeaturedOffers";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingHeader from "@/components/landing/LandingHeader";
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
  title: { absolute: "גרופיו | קניות קבוצתיות לבניינים - חסכו עד 40%" },
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

type LandingPageProps = {
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function LandingPage(props: LandingPageProps) {
  if (props.params) await props.params;
  if (props.searchParams) await props.searchParams;
  return (
    <div className="min-h-screen">
      <script type="application/ld+json">
        {JSON.stringify(organizationJsonLd)}
      </script>
      <LandingHeader />

      <HeroSection />
      <HowItWorksSection />
      <FeaturedOffers />
      <TrustSection />
      <ContractorCTA />
      <LandingFooter />
    </div>
  );
}
