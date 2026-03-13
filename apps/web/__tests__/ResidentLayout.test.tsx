import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

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

vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ accessToken: mockAccessToken, logout: mockLogout })
  ),
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
    '/contractors',
    '/architecture',
    '/building',
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

    // The layout renders two sidebars (mobile + desktop), so the logout button
    // appears twice. Click the first occurrence.
    const logoutBtns = screen.getAllByRole('button', { name: /myAccount/i });
    expect(logoutBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(logoutBtns[0]);

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
