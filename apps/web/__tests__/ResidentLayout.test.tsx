import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- next/navigation mock ----
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/dashboard',
}));

// ---- next-intl mock (returns translation key as-is) ----
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'he',
}));

// ---- NotificationPanel stub ----
vi.mock('@/components/shared/NotificationPanel', () => ({
  NotificationPanel: () => React.createElement('div', { 'data-testid': 'notifications' }),
}));

// ---- Auth store — token is controlled per-test via this variable ----
let mockAccessToken: string | null = 'test-token';
const mockLogout = vi.fn(() => Promise.resolve());

// refreshAccessToken returns true only when there is a token (simulates a live session)
const mockRefreshAccessToken = vi.fn(() => Promise.resolve(!!mockAccessToken));

vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      accessToken: mockAccessToken,
      logout: mockLogout,
      isAuthenticated: !!mockAccessToken,
      user: mockAccessToken ? { role: 'resident', isVerified: true } : null,
      refreshAccessToken: mockRefreshAccessToken,
    })
  ),
  useAuthHasHydrated: vi.fn(() => true),
}));

import ResidentLayout from '../app/(resident)/layout';

describe('ResidentLayout — sidebar navigation links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'test-token'; // authenticated
  });

  const EXPECTED_HREFS = [
    '/dashboard',
    '/offers',
    '/orders',
    '/building',
    '/contractors',
    '/profile',
    '/payments',
    '/chat',
  ];

  for (const href of EXPECTED_HREFS) {
    it(`renders a nav link for ${href}`, () => {
      render(<ResidentLayout><div>child</div></ResidentLayout>);
      const links = screen.getAllByRole('link');
      const match = links.find((l) => l.getAttribute('href') === href);
      expect(match, `Expected a link with href="${href}"`).toBeDefined();
    });
  }
});

describe('ResidentLayout — logout navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'test-token';
  });

  it('calls router.push("/login") after clicking the logout button', async () => {
    render(<ResidentLayout><div>page</div></ResidentLayout>);

    // Open the account menu first (header button with aria-label="accountMenu")
    const accountMenuBtn = screen.getByRole('button', { name: /accountMenu/i });
    fireEvent.click(accountMenuBtn);

    // Then click the logout button in the dropdown
    const logoutBtn = await waitFor(() => screen.getByRole('button', { name: /logout/i }));
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('renders page content when authenticated', () => {
    render(<ResidentLayout><div data-testid="page-content">hello</div></ResidentLayout>);
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
  });
});

describe('ResidentLayout — auth guard (unauthenticated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = null; // not authenticated
  });

  it('calls router.replace("/login") when accessToken is null', async () => {
    render(<ResidentLayout><div>protected</div></ResidentLayout>);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('renders nothing (returns null) when unauthenticated', () => {
    render(<ResidentLayout><div>protected</div></ResidentLayout>);
    expect(screen.queryByText('protected')).toBeNull();
  });
});
