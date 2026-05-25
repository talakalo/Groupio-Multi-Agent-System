import type { Metadata } from "next";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://groupio.co.il";

const CATEGORY_LABELS: Record<string, string> = {
  ac_installation: "התקנת מזגן",
  ac_maintenance: "תחזוקת מזגן",
  kitchen: "מטבח",
  electrical: "חשמל",
  plumbing: "אינסטלציה",
  heating: "חימום",
  renovations: "שיפוצים",
  painting: "צבע",
  flooring: "רצפות",
  windows: "חלונות",
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<Metadata> {
  const { offerId } = await params;

  try {
    const res = await fetch(`${API_BASE}/api/v1/offers/${offerId}`, {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return fallbackMetadata();
    }
    const offer = await res.json() as {
      category?: string;
      contractor?: { businessName?: string };
      basePrice?: number;
      tiers?: Array<{ price?: number }>;
      currentTier?: number;
    };
    const category = offer.category ?? "הצעה";
    const categoryLabel = getCategoryLabel(category);
    const contractorName = offer.contractor?.businessName;
    const currentTier = offer.tiers?.[offer.currentTier ?? 0] ?? offer.tiers?.[0];
    const price = currentTier?.price ?? offer.basePrice;
    const title = contractorName
      ? `${categoryLabel} - ${contractorName} | גרופיו`
      : `${categoryLabel} - הצעת קבוצתית | גרופיו`;
    const description = price
      ? `הצעת קבוצתית ל${categoryLabel}. חסכו עם שכנים וקבלנים מאומתים. תשלום מוגן בנאמנות.`
      : `הצעת קבוצתית ל${categoryLabel}. הצטרפו לשכנים וחיסכו.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "he_IL",
        siteName: "Groupio",
        url: `${SITE_URL}/offers/${offerId}`,
      },
    };
  } catch {
    return fallbackMetadata();
  }
}

function fallbackMetadata(): Metadata {
  return {
    title: "הצעה | גרופיו",
    description: "הצעת קבוצתית לדיירי בניינים. חסכו עם שכנים.",
  };
}

type LayoutProps = {
  children: React.ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function OfferDetailLayout({ children, params, searchParams }: LayoutProps) {
  if (params) await params;
  if (searchParams) await searchParams;
  return children;
}
