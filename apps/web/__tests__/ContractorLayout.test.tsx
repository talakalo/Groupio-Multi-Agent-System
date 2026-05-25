import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- next/navigation mock ----
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => '/contractor/dashboard',
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

// ---- Auth store — token controlled per-test ----
let mockAccessToken: string | null = 'contractor-token';
const mockLogout = vi.fn(() => Promise.resolve());

const mockRefreshContractorToken = vi.fn(() => Promise.resolve(!!mockAccessToken));

vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      accessToken: mockAccessToken,
      logout: mockLogout,
      user: { role: 'contractor' },
      isAuthenticated: !!mockAccessToken,
      refreshAccessToken: mockRefreshContractorToken,
    })
  ),
  useAuthHasHydrated: vi.fn(() => true),
}));

import ContractorLayout from '../app/contractor/layout';

describe('ContractorLayout — sidebar navigation links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'contractor-token';
  });

  const EXPECTED_HREFS = [
    '/contractor/dashboard',
    '/contractor/offers/active',
    '/contractor/offers/create',
    '/contractor/projects',
    '/contractor/profile',
  ];

  for (const href of EXPECTED_HREFS) {
    it(`renders a nav link for ${href}`, () => {
      render(<ContractorLayout><div>child</div></ContractorLayout>);
      const links = screen.getAllByRole('link');
      const match = links.find((l) => l.getAttribute('href') === href);
      expect(match, `Expected a link with href="${href}"`).toBeDefined();
    });
  }

  it('renders the quick-create offer link (/contractor/offers/create)', () => {
    render(<ContractorLayout><div>child</div></ContractorLayout>);
    const links = screen.getAllByRole('link');
    const createLinks = links.filter((l) => l.getAttribute('href') === '/contractor/offers/create');
    // Appears in both sidebar nav and quick-create CTA
    expect(createLinks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ContractorLayout — logout navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'contractor-token';
  });

  it('calls router.push("/login") after clicking the logout button', async () => {
    render(<ContractorLayout><div>page</div></ContractorLayout>);

    // The layout renders two sidebars (mobile + desktop) so the logout button
    // (aria-label translated as "logout") appears twice — click the first one.
    const logoutBtns = screen.getAllByRole('button', { name: /logout/i });
    expect(logoutBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(logoutBtns[0]);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('renders page content when authenticated', () => {
    render(<ContractorLayout><div data-testid="contractor-content">dashboard</div></ContractorLayout>);
    expect(screen.getByTestId('contractor-content')).toBeInTheDocument();
  });
});

describe('ContractorLayout — auth guard (unauthenticated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = null;
  });

  it('calls router.replace("/login") when accessToken is null', async () => {
    render(<ContractorLayout><div>protected</div></ContractorLayout>);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('renders nothing when unauthenticated', () => {
    render(<ContractorLayout><div>protected</div></ContractorLayout>);
    expect(screen.queryByText('protected')).toBeNull();
  });
});
