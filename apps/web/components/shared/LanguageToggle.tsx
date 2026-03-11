'use client';

import { Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

const LOCALES = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
] as const;

export function LanguageToggle() {
  const router = useRouter();
  const locale = useLocale();

  const setLocale = async (newLocale: string) => {
    if (newLocale === locale) return;
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: newLocale }),
      credentials: 'same-origin',
    });
    if (res.ok) router.refresh();
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
