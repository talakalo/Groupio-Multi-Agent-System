/**
 * Navigation tests for the admin app shell (sidebar + header).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '../messages/en.json';
import { AdminShell } from '../components/AdminShell';

// ---- next/font/google (layout uses Inter) ----
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter' }),
}));

// ---- next/font/google (layout uses Inter) ----
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter' }),
}));

// ---- next/navigation ----
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: mockRefresh }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// ---- Admin hooks (prevents API calls during tests) ----
vi.mock('@/lib/hooks', () => ({
  useAdminUser: () => ({
    data: { id: '1', email: 'admin@test.com', full_name: 'Test Admin', role: 'admin' },
  }),
}));

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminShell>
        <div data-testid="page-content">page</div>
      </AdminShell>
    </NextIntlClientProvider>
  );
}

describe('AdminLayout — sidebar navigation links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const EXPECTED_NAV: { label: string; href: string }[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'AI Agents', href: '/agents' },
    { label: 'Escalations', href: '/escalations' },
    { label: 'Contractors', href: '/contractors' },
    { label: 'Analytics', href: '/analytics' },
    { label: 'Users', href: '/users' },
    { label: 'Offers', href: '/offers' },
    { label: 'Payments', href: '/payments' },
    { label: 'Settings', href: '/settings' },
  ];

  for (const { label, href } of EXPECTED_NAV) {
    it(`sidebar has a "${label}" link pointing to ${href}`, () => {
      renderShell();
      const links = screen.getAllByRole('link');
      const match = links.find((l) => l.getAttribute('href') === href);
      expect(match, `Expected sidebar link with href="${href}"`).toBeDefined();
    });
  }

  it('highlights the active route (Dashboard) with sidebar-link-active class', () => {
    renderShell();
    const dashLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/dashboard');
    expect(dashLink).toBeDefined();
    expect(dashLink!.className).toContain('sidebar-link-active');
  });
});

describe('AdminLayout — header logout navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('calls router.push("/login") after clicking Sign out', async () => {
    renderShell();

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('clears admin_role_verified and redirects to login on logout', async () => {
    document.cookie = 'admin_role_verified=1; path=/';

    renderShell();

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
    expect(sessionStorage.getItem('auth_token')).toBeNull();
  });
});

describe('AdminLayout — header settings link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders a header settings icon link pointing to /settings', () => {
    renderShell();
    const settingsLinks = screen.getAllByRole('link', { name: /settings/i });
    const match = settingsLinks.find((l) => l.getAttribute('href') === '/settings');
    expect(match, 'Expected at least one Settings link pointing to /settings').toBeDefined();
  });
});
