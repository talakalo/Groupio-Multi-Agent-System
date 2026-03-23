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
import { useEffect, useState } from 'react';

import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { useAuthStore } from '@/lib/stores/authStore';
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
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      router.replace('/dashboard');
    }
  }, [token, user, router]);

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

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex flex-col gap-2 px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-indigo-500" />
          <span className="text-xl font-bold text-indigo-600">Groupio Admin</span>
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
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-indigo-500' : 'text-gray-400')} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>

      {/* User section */}
      <div className="border-t border-gray-100 px-4 py-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 w-full text-start text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <UserCircle className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{user?.fullName ?? t('myAccount')}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <LogOut className="h-4 w-4 text-gray-400" />
        </button>
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
              <NotificationPanel />

              <button
                type="button"
                className="flex items-center gap-2 ps-3 pe-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <UserCircle className="h-5 w-5 text-indigo-600" />
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
