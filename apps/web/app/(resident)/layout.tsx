'use client';

import {
  CreditCard,
  LayoutDashboard,
  Tag,
  Wrench,
  Building2,
  UserCircle,
  Menu,
  X,
  LogOut,
  MessageSquare,
  ChevronDown,
  FileImage,
  Mail,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { NotificationPanel } from '@/components/shared/NotificationPanel';
import { apiClient } from '@/lib/api/client';
import { useAuthHasHydrated, useAuthStore } from '@/lib/stores/authStore';
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
  { href: '/payments', labelKey: 'payments', icon: CreditCard },
];

const ALLOWED_RESIDENT_ROLES = new Set(['resident', 'admin', 'super_admin']);
const ROLE_DEFAULT_ROUTES: Record<string, string> = {
  contractor: '/contractor/dashboard',
  buildings_manager: '/buildings-manager/dashboard',
};

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('residentNav');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isVerified = useAuthStore((s) => s.user?.isVerified ?? true);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);
  const logout = useAuthStore((s) => s.logout);
  const hasHydrated = useAuthHasHydrated();
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    // Wait for persist to rehydrate before making redirect decisions.
    if (!hasHydrated) return;
    if (!token) {
      // Always attempt token refresh when there is no in-memory access token
      // (e.g. after a full page reload). The HTTP-only refresh cookie is the
      // authoritative session source — if it's valid the user stays logged in,
      // if not we send them to /login. This covers both the `isAuthenticated`
      // true and false cases and avoids the redirect loop that arises when
      // clearAuth() wiped localStorage while the refresh cookie is still valid.
      refreshAccessToken().then((success) => {
        if (!success) router.replace('/login');
      });
    }
  }, [hasHydrated, token, router, refreshAccessToken]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated || !user?.role) return;
    if (!ALLOWED_RESIDENT_ROLES.has(user.role)) {
      router.replace(ROLE_DEFAULT_ROUTES[user.role] || '/login');
    }
  }, [hasHydrated, isAuthenticated, user?.role, router]);

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

  // Hold rendering until persist has rehydrated. This guarantees the
  // auth-gate below sees the correct isAuthenticated/role values and avoids
  // a flash of the full shell on every page load.
  if (!hasHydrated) {
    return null;
  }

  if (!token) {
    // Token is being refreshed — show a loading indicator so the page isn't blank
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-canvas)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (isAuthenticated && user?.role && !ALLOWED_RESIDENT_ROLES.has(user.role)) {
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
  const profileActive = isActive('/profile');

  const sidebar = (
    <nav className="flex flex-col h-full">
      {/* Brand mark */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(26,154,118,0.25)' }}>
          <Building2 className="h-5 w-5 text-primary-300" />
        </div>
        <div>
          <span className="text-lg font-bold text-white tracking-tight">Groupio</span>
          <p className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
            {t('dashboard')}
          </p>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                active
                  ? 'text-white'
                  : 'hover:text-white'
              )}
              style={active ? {
                background: 'rgba(255,255,255,0.12)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
              } : {
                color: 'rgba(255,255,255,0.6)',
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = ''; }}
            >
              <Icon className={cn('h-4.5 w-4.5 flex-shrink-0', active ? 'text-primary-300' : '')} style={active ? {} : { color: 'rgba(255,255,255,0.45)' }} />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>

      {/* AI chat shortcut */}
      <div className="px-3 pb-3">
        <Link
          href="/chat"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150"
          style={{ background: 'linear-gradient(135deg, #1a9a76 0%, #117d5e 100%)', boxShadow: '0 2px 8px rgba(26,154,118,0.3)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(26,154,118,0.4)'; (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 2px 8px rgba(26,154,118,0.3)'; (e.currentTarget as HTMLAnchorElement).style.transform = ''; }}
        >
          <MessageSquare className="h-4 w-4 flex-shrink-0" />
          <span>{t('aiAssistant')}</span>
          <span className="ms-auto text-[10px] font-medium px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.2)' }}>AI</span>
        </Link>
      </div>

      {/* Account (profile) */}
      <div className="px-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem' }}>
        <Link
          href="/profile"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 w-full text-start text-sm rounded-xl px-3 py-2.5 transition-all duration-150"
          style={{
            background: profileActive ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: profileActive ? 'white' : 'rgba(255,255,255,0.6)',
          }}
          onMouseEnter={(e) => { if (!profileActive) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.07)'; if (!profileActive) (e.currentTarget as HTMLAnchorElement).style.color = 'white'; }}
          onMouseLeave={(e) => { if (!profileActive) (e.currentTarget as HTMLAnchorElement).style.background = ''; if (!profileActive) (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.6)'; }}
          aria-label={t('myAccount')}
          aria-current={profileActive ? 'page' : undefined}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{ background: 'rgba(26,154,118,0.4)' }}>
            {user?.fullName?.[0] ?? <UserCircle className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-sm">{user?.fullName ?? t('myAccount')}</p>
            <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{user?.email ?? t('myAccountHint')}</p>
          </div>
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-canvas)' }}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(4, 26, 18, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-72 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
        style={{ background: 'linear-gradient(160deg, #0a2a1e 0%, #0d3d2c 60%, #0f4f38 100%)' }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 end-4 p-1.5 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </aside>

      {/* Sidebar - desktop */}
      <aside
        className="fixed inset-y-0 start-0 z-30 w-72 hidden lg:block"
        style={{ background: 'linear-gradient(160deg, #0a2a1e 0%, #0d3d2c 60%, #0f4f38 100%)' }}
      >
        {sidebar}
      </aside>

      {/* Main content area */}
      <div className="lg:ps-72">
        {/* Unverified email banner */}
        {!isVerified && (
          <div
            className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
            style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm" style={{ color: '#92400e' }}>
              <Mail className="h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{t('verifyEmailBanner')}</span>
            </div>
            {resendSent ? (
              <span className="text-sm font-medium" style={{ color: '#14532d' }}>{t('resendSent')}</span>
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
                className="text-sm font-semibold underline hover:no-underline flex items-center gap-1"
                style={{ color: '#92400e' }}
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

        {/* Top header */}
        <header
          className="sticky top-0 z-20"
          style={{
            background: 'rgba(247, 248, 246, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(10, 51, 41, 0.08)',
            boxShadow: '0 1px 0 rgba(10, 51, 41, 0.05)',
          }}
        >
          <div className="flex items-center justify-between px-4 sm:px-6 h-16">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg transition-colors -ms-2"
              style={{ color: '#4a6154' }}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <LanguageToggle />
              <NotificationPanel />

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 ps-2 pe-2 py-1.5 rounded-xl transition-all duration-150"
                  style={{
                    background: userMenuOpen ? 'rgba(10,51,41,0.07)' : 'transparent',
                    border: '1px solid transparent',
                    borderColor: userMenuOpen ? 'rgba(26,154,118,0.2)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { if (!userMenuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(10,51,41,0.05)'; }}
                  onMouseLeave={(e) => { if (!userMenuOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  aria-label={t('accountMenu')}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #1a9a76, #105f49)' }}>
                    {user?.fullName?.[0] ?? <UserCircle className="h-4 w-4" />}
                  </div>
                  <span className="text-sm font-medium hidden sm:block" style={{ color: '#1f2d27' }}>
                    {user?.fullName?.split(' ')[0] ?? t('myAccount')}
                  </span>
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform duration-200', userMenuOpen && 'rotate-180')}
                    style={{ color: '#9aadaa' }}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    className="absolute end-0 top-full mt-2 w-52 py-1.5 z-50 animate-scale-in"
                    style={{
                      background: 'white',
                      borderRadius: '14px',
                      border: '1px solid rgba(10,51,41,0.1)',
                      boxShadow: '0 8px 24px rgba(10,51,41,0.1), 0 2px 8px rgba(10,51,41,0.06)',
                    }}
                  >
                    <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(10,51,41,0.07)' }}>
                      <p className="font-semibold text-sm truncate" style={{ color: '#0f1f1a' }}>{user?.fullName ?? t('myAccount')}</p>
                      <p className="text-xs truncate mt-0.5" style={{ color: '#9aadaa' }}>{user?.email}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                      style={{ color: '#2d4a40' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(10,51,41,0.04)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = ''; }}
                    >
                      <UserCircle className="h-4 w-4 opacity-60" />
                      {t('profile')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        void handleLogout();
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                      style={{ color: '#dc2626' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.05)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ''; }}
                    >
                      <LogOut className="h-4 w-4 opacity-70" />
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
