import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- next-intl mock (Hebrew strings from locale files) ----
vi.mock('next-intl', async () => {
  const he = await import('../messages/he.json');
  const messages = he.default ?? he;
  const resolve =
    (namespace: string) =>
    (key: string): string => {
      let node: unknown = messages;
      for (const part of namespace.split('.')) {
        node = (node as Record<string, unknown>)?.[part];
      }
      return (node as Record<string, string>)?.[key] ?? key;
    };
  return {
    useTranslations: (namespace: string) => resolve(namespace),
    useLocale: () => 'he',
  };
});

vi.mock('@/lib/utils/unwrapPageParams', () => ({
  useUnwrapPageParams: vi.fn(),
}));

// ---- next/navigation mock ----
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/signup',
  useSearchParams: () => new URLSearchParams(),
}));

// ---- API client mock ----
const mockApiSignup = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    signup: (...args: unknown[]) => mockApiSignup(...args),
  },
}));

// ---- Auth cookie mock ----
vi.mock('@/lib/auth/setAuthCookie', () => ({
  setAuthCookie: vi.fn(),
}));

// ---- Auth store mock ----
const mockSetAccessToken = vi.fn();
const mockSetUser = vi.fn();
vi.mock('@/lib/stores/authStore', () => {
  const useAuthStore = Object.assign(
    vi.fn(
      (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ accessToken: null, isAuthenticated: false })
    ),
    {
      getState: vi.fn(() => ({
        setAccessToken: mockSetAccessToken,
        setUser: mockSetUser,
      })),
    }
  );
  return { useAuthStore };
});

import SignupPage from '../app/(auth)/signup/page';

/** Fill in the signup details form (step 2) with valid data. */
function fillDetailsForm() {
  fireEvent.change(screen.getByLabelText('שם מלא'), { target: { value: 'ישראל ישראלי' } });
  fireEvent.change(screen.getByLabelText('כתובת אימייל'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('מספר טלפון'), { target: { value: '0501234567' } });
  fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'Password1!' } });
  // Required TOS checkbox — jsdom enforces constraint validation before dispatching submit
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('Web SignupPage — navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    // Default: /me returns resident role
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'u1',
        email: 'test@example.com',
        role: 'resident',
        full_name: 'ישראל ישראלי',
        phone: '0501234567',
        is_verified: false,
        preferred_language: 'he',
      }),
    });
  });

  it('redirects resident to /dashboard after signup', async () => {
    mockApiSignup.mockResolvedValueOnce({ token: 'signup-token' });

    render(<SignupPage />);

    // Step 1: "דייר" (resident) role is already selected by default
    // Advance to step 2
    fireEvent.click(screen.getByRole('button', { name: /המשך/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('שם מלא')).toBeInTheDocument();
    });

    fillDetailsForm();
    fireEvent.click(screen.getByRole('button', { name: /הרשמה/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('redirects contractor to /contractor/dashboard after signup', async () => {
    mockApiSignup.mockResolvedValueOnce({ token: 'signup-token' });

    render(<SignupPage />);

    // Step 1: Select contractor role
    fireEvent.click(screen.getByText('קבלן'));
    fireEvent.click(screen.getByRole('button', { name: /המשך/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('שם מלא')).toBeInTheDocument();
    });

    fillDetailsForm();
    fireEvent.click(screen.getByRole('button', { name: /הרשמה/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/contractor/dashboard');
    });
  });

  it('has a link to the login page (/login)', () => {
    render(<SignupPage />);
    const links = screen.getAllByRole('link');
    const loginLink = links.find((l) => l.getAttribute('href') === '/login');
    expect(loginLink).toBeDefined();
  });

  it('does not expose a home logo link on signup (only auth/legal links)', () => {
    render(<SignupPage />);
    const links = screen.getAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === '/')).toBe(false);
    expect(links.some((l) => l.getAttribute('href') === '/login')).toBe(true);
  });

  it('back button returns from step 2 to step 1 without navigating', async () => {
    render(<SignupPage />);

    fireEvent.click(screen.getByRole('button', { name: /המשך/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('שם מלא')).toBeInTheDocument();
    });

    // Click the back button
    fireEvent.click(screen.getByRole('button', { name: /חזרה/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /המשך/i })).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
