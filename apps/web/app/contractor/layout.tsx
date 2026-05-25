'use client';

import {
  LayoutDashboard,
  FolderKanban,
  UserCircle,
  Menu,
  X,
  LogOut,
  Building2,
  ChevronDown,
  PlusCircle,
  ClipboardList,
  Mail,
  Loader2,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { useAuthHasHydrated, useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { LanguageToggle } from '@/components/shared/LanguageToggle';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/contractor/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/contractor/offers/active', labelKey: 'activeOffers', icon: ClipboardList },
  { href: '/contractor/projects', labelKey: 'projects', icon: FolderKanban },
  { href: '/contractor/earnings', labelKey: 'earnings', icon: DollarSign },
  { href: '/contractor/profile', labelKey: 'profile', icon: UserCircle },
];

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('contractorNav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isVerified = user?.isVerified ?? true;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const hasHydrated = useAuthHasHydrated();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      refreshAccessToken().then((success) => {
        if (!success) router.replace('/login');
      });
    }
  }, [hasHydrated, token, router, refreshAccessToken]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [userMenuOpen]);

  if (!hasHydrated) {
    return null;
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }


  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout errors — always redirect to login
    }
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
        <Building2 className="h-8 w-8 text-primary-500" />
        <span className="text-xl font-bold text-primary-600">Groupio</span>
        <span className="badge-accent text-xs ms-auto">{t('contractorBadge')}</span>
      </div>

      {/* Nav links */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-primary-500' : 'text-gray-400')} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>

      {/* Quick create button */}
      <div className="px-3 pb-3">
        <Link
          href="/contractor/offers/create"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-500 text-white hover:bg-accent-600 transition-colors text-sm font-medium"
        >
          <PlusCircle className="h-5 w-5" />
          <span>{t('newOffer')}</span>
        </Link>
      </div>

      {/* User section */}
      <div className="border-t border-gray-100 px-4 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 w-full text-start text-sm text-gray-600 hover:text-gray-900 transition-colors"
          aria-label={t('logout')}
        >
          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center">
            <UserCircle className="h-5 w-5 text-accent-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{t('myBusiness')}</p>
          </div>
          <LogOut className="h-4 w-4 text-gray-400" />
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 end-4 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 start-0 z-30 w-72 bg-white border-e border-gray-100 hidden lg:block">
        {sidebar}
      </aside>

      {/* Main content area */}
      <div className="lg:ps-72">
        {/* Unverified email banner */}
        {!isVerified && (
          <div
            className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-amber-800 text-sm">
              <Mail className="h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{t('verifyEmailBanner')}</span>
            </div>
            {resendSent ? (
              <span className="text-emerald-700 text-sm font-medium">{t('resendSent')}</span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  setResending(true);
                  try {
                    await apiClient.resendVerification();
                    setResendSent(true);
                  } finally {
                    setResending(false);
                  }
                }}
                disabled={resending}
                className="text-amber-800 font-medium text-sm underline hover:no-underline flex items-center gap-1"
              >
                {resending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('resendSending')}
                  </>
                ) : (
                  t('resendVerification')
                )}
              </button>
            )}
          </div>
        )}

        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="flex items-center justify-between px-4 sm:px-6 h-16">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-900 -ms-2"
              aria-label="Open sidebar"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <LanguageToggle />
              <NotificationPanel />

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 ps-3 pe-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
                  aria-label={t('accountMenu')}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center">
                    <UserCircle className="h-5 w-5 text-accent-600" />
                  </div>
                  <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', userMenuOpen && 'rotate-180')} />
                </button>
                {userMenuOpen && (
                  <div className="absolute end-0 top-full mt-2 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="font-medium text-gray-900 truncate">{user?.fullName ?? t('myBusiness')}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <Link
                      href="/contractor/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <UserCircle className="h-4 w-4" />
                      {t('profile')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
