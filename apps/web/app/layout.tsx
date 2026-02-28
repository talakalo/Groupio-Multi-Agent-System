import type { Metadata } from "next";
import { Inter, Heebo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import { Providers } from "./providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Groupio — רכישה קבוצתית לדיירים",
    template: "%s | Groupio",
  },
  description: "פלטפורמה לרכישה קבוצתית של שירותי בית לדיירי בניינים בישראל. חסכו עד 40% על שירותי תחזוקה ושיפוץ.",
  keywords: ["רכישה קבוצתית", "שיפוץ", "קבלן", "בניין", "ישראל", "groupio"],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: "https://groupio.co.il",
    siteName: "Groupio",
    title: "Groupio — רכישה קבוצתית לדיירים",
    description: "פלטפורמה לרכישה קבוצתית של שירותי בית לדיירי בניינים בישראל",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Groupio — רכישה קבוצתית",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Groupio — רכישה קבוצתית לדיירים",
    description: "חסכו עד 40% על שירותי בית עם רכישה קבוצתית",
    images: ["/og-image.png"],
  },
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${heebo.variable}`}>
      <body className="font-heebo antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
