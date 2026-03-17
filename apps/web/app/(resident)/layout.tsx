'use client';

import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MoreHorizontal,
  ShoppingBag,
  Tag,
  UserCircle,
  Wrench,
  X,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useCallback, type ReactNode } from 'react';

import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
}

const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/offers', labelKey: 'offers', icon: Tag },
  { href: '/orders', labelKey: 'orders', icon: ShoppingBag },
  { href: '/building', labelKey: 'building', icon: Building2 },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/contractors', labelKey: 'contractors', icon: Wrench },
  { href: '/payments', labelKey: 'payments', icon: CreditCard },
  { href: '/chat', labelKey: 'aiChat', icon: MessageSquare },
];

const BOTTOM_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/offers', labelKey: 'offers', icon: Tag },
  { href: '/orders', labelKey: 'orders', icon: ShoppingBag },
  { href: '/building', labelKey: 'building', icon: Building2 },
];

// ---------------------------------------------------------------------------
// Mobile "More" sheet
// ---------------------------------------------------------------------------

function MobileMoreSheet({
  open,
  onClose,
  items,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  isActive: (href: string) => boolean;
}) {
  const t = useTranslations('residentNav');

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl shadow-xl pb-safe animate-in slide-in-from-bottom duration-200">
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <nav className="px-4 pb-6 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-primary-500' : 'text-gray-400')} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}

          <Link
            href="/profile"
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
              isActive('/profile')
                ? 'bg-primary-50 text-primary-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}
          >
            <UserCircle className={cn('h-5 w-5', isActive('/profile') ? 'text-primary-500' : 'text-gray-400')} />
            <span>{t('profile')}</span>
          </Link>
        </nav>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar nav link
// ---------------------------------------------------------------------------

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations('residentNav');
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
        active
          ? 'bg-primary-50 text-primary-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-primary-500' : 'text-gray-400')} />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function ResidentLayout(props: { children: ReactNode } & PageParamsProps) {
  unwrapPageParams(props);
  const { children } = props;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('residentNav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const token = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isVerified = useAuthStore((s) => s.user?.isVerified ?? true);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token && isAuthenticated) {
      refreshAccessToken().then((success) => {
        if (!success) router.replace('/login');
      });
    } else if (!token && !isAuthenticated) {
      router.replace('/login');
    }
  }, [token, isAuthenticated, router, refreshAccessToken]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  if (!token && !isAuthenticated) return null;

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Always redirect
    }
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Check if "more" items have an active route (to highlight the more button)
  const moreItems = [...SECONDARY_NAV, { href: '/profile', labelKey: 'profile', icon: UserCircle }];
  const moreHasActive = moreItems.some((item) => isActive(item.href));

  // ---------------------------------------------------------------------------
  // Sidebar content (shared between mobile drawer and desktop sidebar)
  // ---------------------------------------------------------------------------
  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
        <Building2 className="h-8 w-8 text-primary-500" />
        <span className="text-xl font-bold text-primary-600">Groupio</span>
      </div>

      {/* Primary nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item.href)} onClick={closeSidebar} />
          ))}
        </div>

        {/* Secondary nav */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('more')}
          </p>
          <div className="space-y-1">
            {SECONDARY_NAV.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActive(item.href)} onClick={closeSidebar} />
            ))}
          </div>
        </div>
      </div>

      {/* Profile link at bottom */}
      <div className="border-t border-gray-100 px-3 py-3">
        <SidebarLink
          item={{ href: '/profile', labelKey: 'profile', icon: UserCircle }}
          active={isActive('/profile')}
          onClick={closeSidebar}
        />
      </div>

      {/* Logout */}
      <div className="border-t border-gray-100 px-4 py-4">
        <button
          type="button"
          onClick={handleLogout}
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
    <div className="min-h-screen bg-gray-50 pb-16 sm:pb-0">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar — mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
      >
        <button
          type="button"
          onClick={closeSidebar}
          className="absolute top-4 end-4 p-1 text-gray-400 hover:text-gray-600"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      {/* Sidebar — desktop (RTL-aware: start-0 = right in RTL) */}
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
              <span>
                נא לאמת את כתובת האימייל שלכם. בדקו את תיבת הדואר ולחצו על קישור האימות.
              </span>
            </div>
            {resendSent ? (
              <span className="text-emerald-700 text-sm font-medium">נשלח! בדקו את האימייל.</span>
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
                    שולח...
                  </>
                ) : (
                  'שליחת קישור אימות מחדש'
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
              <Link
                href="/profile"
                className="flex items-center gap-2 ps-3 pe-2 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <UserCircle className="h-5 w-5 text-primary-600" />
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Mobile bottom navigation (visible sm and below)              */}
      {/* ------------------------------------------------------------ */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 sm:hidden">
        <div className="flex items-center justify-around h-16">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors',
                  active ? 'text-primary-700' : 'text-gray-500'
                )}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-primary-500' : 'text-gray-400')} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}

          {/* "More" button */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-colors',
              moreHasActive ? 'text-primary-700' : 'text-gray-500'
            )}
          >
            <MoreHorizontal className={cn('h-5 w-5', moreHasActive ? 'text-primary-500' : 'text-gray-400')} />
            <span>{t('more')}</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" bottom sheet */}
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={SECONDARY_NAV}
        isActive={isActive}
      />
    </div>
  );
}
