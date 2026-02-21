import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---- next/navigation mock ----
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

// ---- API client mock ----
const mockApiLogin = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    login: (...args: unknown[]) => mockApiLogin(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
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

import LoginPage from '../app/(auth)/login/page';

describe('Web LoginPage — navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('redirects to /dashboard after a successful login', async () => {
    mockApiLogin.mockResolvedValueOnce({ token: 'auth-token-123' });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'u1',
        email: 'test@example.com',
        role: 'resident',
        full_name: 'Test User',
        phone: '0501234567',
        is_verified: true,
        preferred_language: 'he',
      }),
    });

    render(<LoginPage />);

    // Labels rendered in Hebrew
    fireEvent.change(screen.getByLabelText('כתובת אימייל'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה'), {
      target: { value: 'Password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /התחברות/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('does NOT navigate when login credentials are wrong (401)', async () => {
    const { ApiError } = await import('@/lib/api/client');
    mockApiLogin.mockRejectedValueOnce(new ApiError('Unauthorized', 401));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('כתובת אימייל'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה'), {
      target: { value: 'WrongPass1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /התחברות/i }));

    await waitFor(() => {
      // An error message appears
      expect(screen.getByText(/שגויים/i)).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('has a link to the signup page (/signup)', () => {
    render(<LoginPage />);
    const links = screen.getAllByRole('link');
    const signupLink = links.find((l) => l.getAttribute('href') === '/signup');
    expect(signupLink).toBeDefined();
  });

  it('has a logo link pointing to the home page (/)', () => {
    render(<LoginPage />);
    const homeLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/');
    expect(homeLink).toBeDefined();
  });
});
