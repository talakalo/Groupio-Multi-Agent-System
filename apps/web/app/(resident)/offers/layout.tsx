import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "הצעות קבוצתיות | גרופיו",
  description:
    "עיינו בהצעות קבוצתיות פעילות לבניינים. חסכו עד 40% על שירותי תחזוקה, שיפוץ, מיזוג אוויר ועוד עם קבלנים מאומתים.",
  openGraph: {
    title: "הצעות קבוצתיות | גרופיו",
    description:
      "עיינו בהצעות קבוצתיות לבניינים. חסכו עם שכנים וקבלנים מאומתים.",
    type: "website",
    locale: "he_IL",
    siteName: "Groupio",
  },
};

export default function OffersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
