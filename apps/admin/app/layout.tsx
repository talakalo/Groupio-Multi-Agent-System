import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";
import { AdminShell } from "@/components/AdminShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "Groupio Admin",
    template: "%s | Groupio Admin",
  },
  description: "Groupio multi-agent system administration panel",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let locale = "he";
  let messages: AbstractIntlMessages = {};
  try {
    locale = await getLocale();
    messages = await getMessages();
  } catch {
    const heMessages = await import("../messages/he.json");
    messages = heMessages.default as AbstractIntlMessages;
  }
  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"} className={inter.variable}>
      <body className={inter.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AdminShell>{children}</AdminShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
