// Root layout — intentionally a Server Component.
// All client-only state (sidebar collapse, query client) lives in AdminShell.
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { AdminShell } from "@/components/AdminShell";

export const metadata: Metadata = {
  title: {
    default: "Groupio Admin",
    template: "%s | Groupio Admin",
  },
  description: "Groupio multi-agent system administration panel",
  robots: { index: false, follow: false }, // admin should never be indexed
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
