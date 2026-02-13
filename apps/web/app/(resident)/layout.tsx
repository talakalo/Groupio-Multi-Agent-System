'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Tag,
  Wrench,
  Building2,
  UserCircle,
  Menu,
  X,
  LogOut,
  MessageSquare,
  Bell,
  ChevronDown,
  FileImage,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/offers', labelKey: 'offers', icon: Tag },
  { href: '/contractors', labelKey: 'contractors', icon: Wrench },
  { href: '/architecture', labelKey: 'architecture', icon: FileImage },
  { href: '/building', labelKey: 'building', icon: Building2 },
  { href: '/profile', labelKey: 'profile', icon: UserCircle },
];

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('residentNav');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
        <Building2 className="h-8 w-8 text-primary-500" />
        <span className="text-xl font-bold text-primary-600">Groupio</span>
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

      {/* AI chat shortcut */}
      <div className="px-3 pb-3">
        <Link
          href="/chat"
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary-500 text-white hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          <MessageSquare className="h-5 w-5" />
          <span>{t('aiAssistant')}</span>
        </Link>
      </div>

      {/* User section */}
      <div className="border-t border-gray-100 px-4 py-4">
        <button
          type="button"
          className="flex items-center gap-3 w-full text-start text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <UserCircle className="h-5 w-5 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{t('myAccount')}</p>
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
              <button
                type="button"
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <button
                type="button"
                className="flex items-center gap-2 ps-3 pe-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <UserCircle className="h-5 w-5 text-primary-600" />
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
