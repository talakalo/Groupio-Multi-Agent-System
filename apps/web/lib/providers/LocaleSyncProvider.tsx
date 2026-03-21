"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuthStore } from "@/lib/stores/authStore";

const VALID_LOCALES = ["he", "en"] as const;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Syncs locale from user profile to NEXT_LOCALE cookie on authenticated load.
 * When a returning user has preferred_language in profile different from
 * the current cookie, we update the cookie and refresh so next-intl picks it up.
 */
export function LocaleSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;
    if (!accessToken) return;

    const sync = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "include",
        });
        if (!res.ok) return;

        const me = (await res.json()) as { preferred_language?: string };
        const preferred = me?.preferred_language ?? "he";
        if (!VALID_LOCALES.includes(preferred as (typeof VALID_LOCALES)[number])) {
          return;
        }

        const current = document.documentElement.getAttribute("lang") ?? "he";
        if (preferred === current) {
          hasSynced.current = true;
          return;
        }

        const localeRes = await fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: preferred }),
          credentials: "same-origin",
        });
        if (localeRes.ok) {
          hasSynced.current = true;
          router.refresh();
        }
      } catch {
        // Ignore sync failure
      }
    };

    sync();
  }, [accessToken, router]);

  return <>{children}</>;
}
