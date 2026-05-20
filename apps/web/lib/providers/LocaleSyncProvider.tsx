"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/lib/stores/authStore";

const VALID_LOCALES = ["he", "en"] as const;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SS_KEY = "groupio-locale-synced";

/**
 * Syncs locale from user profile to NEXT_LOCALE cookie on authenticated load.
 *
 * Runs at most once per browser session (sessionStorage flag).  The flag is
 * cleared on logout (accessToken → null) so the next sign-in gets a fresh
 * sync.  LanguageToggle also sets the flag when the user explicitly picks a
 * locale, preventing this provider from overriding the explicit choice on the
 * next render/refresh cycle.
 */
export function LocaleSyncProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      // Logged out — clear the flag so the next login gets a fresh sync.
      sessionStorage.removeItem(SS_KEY);
      return;
    }

    // Already synced this session (set here or by LanguageToggle).
    if (sessionStorage.getItem(SS_KEY)) return;

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

        // Mark synced regardless — if locales already match, no POST needed.
        sessionStorage.setItem(SS_KEY, "1");

        const current = document.documentElement.getAttribute("lang") ?? "he";
        if (preferred === current) return;

        const localeRes = await fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: preferred }),
          credentials: "same-origin",
        });
        if (localeRes.ok) {
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
