'use client';

import { Building2, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

import { LanguageToggle } from '@/components/shared/LanguageToggle';

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('landing.nav');

  const NAV_LINKS = [
    { label: t('howItWorks'), href: '#how-it-works', scroll: true },
    { label: t('offers'), href: '/offers', scroll: false },
  ];

  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary-500" />
            <span className="text-2xl font-bold text-primary-600">Groupio</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) =>
              link.scroll ? (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-primary-600 transition-colors text-sm"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-primary-600 transition-colors text-sm"
                >
                  {link.label}
                </Link>
              )
            )}
            <LanguageToggle />
            <Link
              href="/login"
              className="text-gray-700 font-medium hover:text-primary-600 transition-colors text-sm"
            >
              {t('login')}
            </Link>
            <Link href="/signup" className="btn-primary text-sm">
              {t('signupFree')}
            </Link>
          </nav>

          {/* Mobile: language toggle + hamburger */}
          <div className="flex md:hidden items-center gap-3">
            <LanguageToggle />
            <button
              type="button"
              aria-label={open ? t('closeMenu') : t('openMenu')}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white/95 backdrop-blur-md">
          <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) =>
              link.scroll ? (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  {link.label}
                </Link>
              )
            )}
            <div className="h-px bg-gray-100 my-2" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              {t('login')}
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mx-3 mt-1 btn-primary text-center text-sm"
            >
              {t('signupFree')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
