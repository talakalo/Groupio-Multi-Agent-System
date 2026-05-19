'use client';

import {
  LayoutDashboard,
  Building2,
  Shield,
  UserCircle,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { useAuthHasHydrated, useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { useUnwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/admin/buildings', labelKey: 'buildingsManager', icon: Building2 },
];

export default function AdminLayout(props: { children: React.ReactNode } & PageParamsProps) {
  useUnwrapPageParams(props);
  const { children } = props;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('adminNav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const hasHydrated = useAuthHasHydrated();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) {
      refreshAccessToken().then((ok) => {
        if (!ok) router.replace('/login');
      });
      return;
    }
    if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      router.replace('/dashboard');
    }
  }, [hasHydrated, token, user, router, refreshAccessToken]);

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
    return null;
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
  const accountActive = isActive('/admin/account');

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex flex-col gap-2 px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary-500" />
          <span className="text-xl font-bold text-primary-600">Groupio Admin</span>
        </div>
        <p className="text-xs text-gray-400 leading-none">
          {user?.role === 'super_admin' ? t('roleSuperAdmin') : t('roleAdmin')}
        </p>
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

      {/* Account — admin & super_admin; logout via header menu or account page */}
      <div className="border-t border-gray-100 px-4 py-4">
        <Link
          href="/admin/account"
          onClick={() => setSidebarOpen(false)}
          className={cn(
            'flex items-center gap-3 w-full text-start text-sm transition-colors rounded-xl px-2 py-2 -mx-2',
            accountActive
              ? 'bg-primary-50 text-primary-700 hover:bg-primary-50'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
          aria-label={t('myAccount')}
          aria-current={accountActive ? 'page' : undefined}
        >
          <div
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              accountActive ? 'bg-primary-200' : 'bg-primary-100'
            )}
          >
            <UserCircle
              className={cn('h-5 w-5', accountActive ? 'text-primary-700' : 'text-primary-600')}
              aria-hidden
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{t('myAccount')}</p>
            <p className="text-xs text-gray-500 truncate">{t('myAccountHint')}</p>
          </div>
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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

      <aside className="fixed inset-y-0 start-0 z-30 w-72 bg-white border-e border-gray-100 hidden lg:block">
        {sidebar}
      </aside>

      <div className="lg:ps-72">
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
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <UserCircle className="h-5 w-5 text-primary-600" />
                  </div>
                  <ChevronDown
                    className={cn('h-4 w-4 text-gray-400 transition-transform', userMenuOpen && 'rotate-180')}
                  />
                </button>
                {userMenuOpen && (
                  <div className="absolute end-0 top-full mt-2 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="font-medium text-gray-900 truncate">{user?.fullName ?? t('myAccount')}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      <p className="text-xs text-primary-600 mt-1">
                        {user?.role === 'super_admin' ? t('roleSuperAdmin') : t('roleAdmin')}
                      </p>
                    </div>
                    <Link
                      href="/admin/account"
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
                        void handleLogout();
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

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
