'use client';

import {
  LayoutDashboard,
  Tag,
  HardHat,
  Building2,
  UserCircle,
  Bell,
  Menu,
  X,
  ChevronLeft,
  Package,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResidentLayoutProps {
  children: React.ReactNode;
  /** Resident display name */
  userName?: string;
  /** Avatar URL (falls back to initials) */
  avatarUrl?: string;
  /** Unread notification count */
  notificationCount?: number;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

// ---------------------------------------------------------------------------
// Navigation links
// ---------------------------------------------------------------------------

const NAV_ITEMS: NavItem[] = [
  { label: 'לוח בקרה', href: '/dashboard', icon: LayoutDashboard },
  { label: 'הצעות', href: '/offers', icon: Tag },
  { label: 'ההזמנות שלי', href: '/orders', icon: Package },
  { label: 'קבלנים', href: '/contractors', icon: HardHat },
  { label: 'הבניין שלי', href: '/building', icon: Building2 },
  { label: 'פרופיל', href: '/profile', icon: UserCircle },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResidentLayout({
  children,
  userName = 'דייר',
  avatarUrl,
  notificationCount = 0,
}: ResidentLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* ---- Mobile overlay ---- */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* ---- Sidebar ---- */}
      <aside
        className={cn(
          'fixed inset-y-0 end-0 z-50 flex w-64 flex-col bg-white border-s border-gray-200',
          'transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo area */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <Link href="/dashboard" className="text-xl font-bold text-primary-600">
            גרופיו
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="סגור תפריט"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User card */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold">
              {userName.charAt(0)}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {userName}
            </span>
            <span className="text-xs text-gray-500">דייר</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <item.icon
                  className={cn(
                    'h-5 w-5 shrink-0',
                    isActive ? 'text-primary-500' : 'text-gray-400',
                  )}
                />
                <span>{item.label}</span>
                {isActive && (
                  <ChevronLeft className="ms-auto h-4 w-4 text-primary-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-[11px] text-gray-400 text-center">
            Groupio &copy; {new Date().getFullYear()}
          </p>
        </div>
      </aside>

      {/* ---- Main content area ---- */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md px-4 py-3 lg:px-8">
          {/* Hamburger (mobile) */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="פתח תפריט"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden lg:block" />

          {/* Notification bell */}
          <button
            type="button"
            className="relative rounded-xl p-2 text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="התראות"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -start-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
