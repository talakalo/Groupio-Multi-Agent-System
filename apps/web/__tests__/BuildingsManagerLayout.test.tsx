/**
 * BuildingsManagerLayout — role-based redirects.
 * - Resident/contractor → /dashboard
 * - buildings_manager, admin, super_admin may use buildings-manager routes (no auto-redirect to admin app)
 */
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReplace = vi.fn();
let mockPathname = '/buildings-manager/dashboard';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => mockPathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/shared/NotificationPanel', () => ({
  NotificationPanel: () => React.createElement('div', { 'data-testid': 'notifications' }),
}));

type UserRole = 'super_admin' | 'admin' | 'buildings_manager' | 'resident' | 'contractor';

let mockToken: string | null = 'token';
let mockUser: { role: UserRole } | null = { role: 'buildings_manager' };

vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      accessToken: mockToken,
      user: mockUser,
      isAuthenticated: Boolean(mockToken),
      logout: vi.fn(() => Promise.resolve()),
      refreshAccessToken: vi.fn(() => Promise.resolve()),
    })
  ),
  useAuthHasHydrated: () => true,
}));

// useUnwrapPageParams is a no-op in tests (no props.params/searchParams)
vi.mock('@/lib/utils/unwrapPageParams', () => ({
  useUnwrapPageParams: vi.fn(),
}));

import BuildingsManagerLayout from '../app/buildings-manager/layout';

describe('BuildingsManagerLayout — admin/super_admin redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken = 'token';
    mockUser = { role: 'buildings_manager' };
    mockPathname = '/buildings-manager/dashboard';
  });

  it('allows super_admin on /buildings-manager/dashboard (no forced redirect)', async () => {
    mockUser = { role: 'super_admin' };
    render(<BuildingsManagerLayout><div>child</div></BuildingsManagerLayout>);

    await waitFor(() => {
      expect(screen.getByText('child')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/admin/dashboard');
  });

  it('allows admin on /buildings-manager/dashboard (no forced redirect)', async () => {
    mockUser = { role: 'admin' };
    render(<BuildingsManagerLayout><div>child</div></BuildingsManagerLayout>);

    await waitFor(() => {
      expect(screen.getByText('child')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/admin/dashboard');
  });

  it('does NOT redirect buildings_manager from /buildings-manager/dashboard', async () => {
    mockUser = { role: 'buildings_manager' };
    render(<BuildingsManagerLayout><div>child</div></BuildingsManagerLayout>);

    await waitFor(() => {
      expect(screen.getByText('child')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/admin/dashboard');
  });

  it('does NOT redirect admin from /buildings-manager/buildings', async () => {
    mockUser = { role: 'admin' };
    mockPathname = '/buildings-manager/buildings';
    render(<BuildingsManagerLayout><div>child</div></BuildingsManagerLayout>);

    await waitFor(() => {
      expect(screen.getByText('child')).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalledWith('/admin/dashboard');
  });

  it('redirects resident to /dashboard', async () => {
    mockUser = { role: 'resident' };
    render(<BuildingsManagerLayout><div>child</div></BuildingsManagerLayout>);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    });
  });
});
