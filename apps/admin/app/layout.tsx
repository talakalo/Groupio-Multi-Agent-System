// Root layout — intentionally a Server Component.
// All client-only state (sidebar collapse, query client) lives in AdminShell.
// TODO: Wire up i18n (next-intl) — translation files are in messages/he.json and messages/en.json
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={inter.variable}>
      <body className={inter.className}>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
