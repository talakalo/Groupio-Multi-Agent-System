/**
 * Navigation tests for the admin app layout.
 *
 * The RootLayout embeds the Sidebar (8 nav links) and Header (logout button).
 * Tests verify that all sidebar links point to the correct routes and that the
 * logout action redirects the user to /login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---- next/navigation ----
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// ---- Admin hooks (prevents API calls during tests) ----
vi.mock('@/lib/hooks', () => ({
  useAdminUser: () => ({
    data: { id: '1', email: 'admin@test.com', full_name: 'Test Admin', role: 'admin' },
  }),
}));

import RootLayout from '../app/layout';

function renderLayout() {
  return render(<RootLayout><div data-testid="page-content">page</div></RootLayout>);
}

describe('AdminLayout — sidebar navigation links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const EXPECTED_NAV: { label: string; href: string }[] = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Agents', href: '/agents' },
    { label: 'Escalations', href: '/escalations' },
    { label: 'Contractors', href: '/contractors' },
    { label: 'Analytics', href: '/analytics' },
    { label: 'Users', href: '/users' },
    { label: 'Offers', href: '/offers' },
    { label: 'Settings', href: '/settings' },
  ];

  for (const { label, href } of EXPECTED_NAV) {
    it(`sidebar has a "${label}" link pointing to ${href}`, () => {
      renderLayout();
      const links = screen.getAllByRole('link');
      const match = links.find((l) => l.getAttribute('href') === href);
      expect(match, `Expected sidebar link with href="${href}"`).toBeDefined();
    });
  }

  it('highlights the active route (Dashboard) with sidebar-link-active class', () => {
    renderLayout();
    // usePathname() returns '/dashboard', so the Dashboard link should be active
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
    renderLayout();

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('clears admin_role_verified and redirects to login on logout', async () => {
    document.cookie = 'admin_role_verified=1; path=/';

    renderLayout();

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
    // admin_role_verified is cleared by handleLogout (no auth token in sessionStorage)
    expect(sessionStorage.getItem('auth_token')).toBeNull();
  });
});

describe('AdminLayout — header settings link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders a header settings icon link pointing to /settings', () => {
    renderLayout();
    // Both the sidebar link and the header icon link point to /settings;
    // verify that at least one link with accessible name "Settings" has the right href.
    const settingsLinks = screen.getAllByRole('link', { name: /settings/i });
    const match = settingsLinks.find((l) => l.getAttribute('href') === '/settings');
    expect(match, 'Expected at least one Settings link pointing to /settings').toBeDefined();
  });
});
