'use client';

import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';

import { useAuthStore } from '@/lib/stores/authStore';

const LOCALES = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
] as const;

export function LanguageToggle() {
  const locale = useLocale();
  const accessToken = useAuthStore((s) => s.accessToken);

  const setLocale = async (newLocale: string) => {
    if (newLocale === locale) return;
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
      credentials: 'same-origin',
    });
    if (res.ok) {
      // Stamp the session flag so LocaleSyncProvider does not revert this
      // explicit user choice back to preferred_language on the next render.
      sessionStorage.setItem('groupio-locale-synced', '1');
      if (accessToken) {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          await fetch(`${apiBase}/api/v1/auth/me`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ preferred_language: newLocale }),
          });
        } catch {
          // ignore profile sync failure
        }
      }
      // Hard reload so the server re-reads the NEXT_LOCALE cookie and
      // NextIntlClientProvider receives the updated locale. router.refresh()
      // is insufficient here because Next.js 15 can serve the root layout
      // from its RSC cache, leaving useLocale() returning the stale value.
      window.location.reload();
    }
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100">
      <Globe className="h-4 w-4 text-gray-500 ms-1" />
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => setLocale(l.value)}
          className={`px-2.5 py-1 rounded-md text-sm font-medium transition-colors ${
            locale === l.value
              ? 'bg-white text-primary-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
