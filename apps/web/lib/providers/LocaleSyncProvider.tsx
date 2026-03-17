"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuthStore } from "@/lib/stores/authStore";

const VALID_LOCALES = ["he", "en"] as const;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Syncs locale from user profile to NEXT_LOCALE cookie on authenticated load.
 * Uses user from store when available to avoid redundant /me fetch on every navigation.
 */
export function LocaleSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;
    if (!accessToken) return;

    const sync = async () => {
      try {
        // Use user from store when available — avoids /me fetch on every page load
        const fromStore =
          user?.preferredLanguage ?? (user as { preferred_language?: string })?.preferred_language;

        let preferred: string;

        if (fromStore && VALID_LOCALES.includes(fromStore as (typeof VALID_LOCALES)[number])) {
          preferred = fromStore;
        } else {
          // Only fetch /me when store has no preferredLanguage (e.g. returning visitor)
          const res = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            credentials: "include",
          });
          if (!res.ok) return;
          const me = (await res.json()) as { preferred_language?: string };
          preferred = me?.preferred_language ?? "he";
          if (!VALID_LOCALES.includes(preferred as (typeof VALID_LOCALES)[number])) {
            hasSynced.current = true;
            return;
          }
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
  }, [accessToken, user?.preferredLanguage, router]);

  return <>{children}</>;
}
