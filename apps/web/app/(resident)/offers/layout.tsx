import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הצעות קבוצתיות",
  description:
    "עיינו בהצעות קבוצתיות פעילות לבניינים. חסכו עד 40% על שירותי תחזוקה, שיפוץ, מיזוג אוויר ועוד עם קבלנים מאומתים.",
  openGraph: {
    title: "הצעות קבוצתיות",
    description:
      "עיינו בהצעות קבוצתיות לבניינים. חסכו עם שכנים וקבלנים מאומתים.",
    type: "website",
    locale: "he_IL",
    siteName: "Groupio",
  },
};

type LayoutProps = {
  children: React.ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function OffersLayout({ children, params, searchParams }: LayoutProps) {
  if (params) await params;
  if (searchParams) await searchParams;
  return children;
}
