import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import LoginPage from '../app/(auth)/login/page';
import messages from '../messages/he.json';

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
    constructor(message: string = '', status = 500) {
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

// ---- unwrapPageParams uses React.use() — stub in tests ----
vi.mock('@/lib/utils/unwrapPageParams', () => ({
  unwrapPageParams: vi.fn(),
}));

// ---- Auth store mock ----
const mockSetAccessToken = vi.fn();
const mockSetUser = vi.fn();
vi.mock('@/lib/stores/authStore', () => {
  const mockState: Record<string, unknown> = { accessToken: null, isAuthenticated: false, user: null };
  const useAuthStore = Object.assign(
    vi.fn((selector?: (s: Record<string, unknown>) => unknown) =>
      typeof selector === 'function' ? selector(mockState) : mockState
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


function renderLoginPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>
  );
}

describe('Web LoginPage — navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('redirects to /dashboard after a successful login as resident', async () => {
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

    renderLoginPage();

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

  it('redirects to /admin/dashboard after login as admin', async () => {
    mockApiLogin.mockResolvedValueOnce({ token: 'auth-token-123' });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'u2',
          email: 'admin@example.com',
          role: 'admin',
          full_name: 'Admin User',
          phone: '0501111111',
          is_verified: true,
          preferred_language: 'he',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    renderLoginPage();

    fireEvent.change(screen.getByLabelText('כתובת אימייל'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה'), {
      target: { value: 'Password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /התחברות/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  it('redirects to /admin/dashboard after login as super_admin', async () => {
    mockApiLogin.mockResolvedValueOnce({ token: 'auth-token-123' });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'u1',
          email: 'admin@example.com',
          role: 'super_admin',
          full_name: 'Super Admin',
          phone: '0500000000',
          is_verified: true,
          preferred_language: 'he',
        }),
      })
      .mockResolvedValueOnce({ ok: true }); // locale API

    renderLoginPage();

    fireEvent.change(screen.getByLabelText('כתובת אימייל'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה'), {
      target: { value: 'Password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /התחברות/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  it('redirects to /buildings-manager/dashboard after login as buildings_manager', async () => {
    mockApiLogin.mockResolvedValueOnce({ token: 'auth-token-123' });
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'u3',
          email: 'bm@example.com',
          role: 'buildings_manager',
          full_name: 'Buildings Manager',
          phone: '0502222222',
          is_verified: true,
          preferred_language: 'he',
        }),
      })
      .mockResolvedValueOnce({ ok: true });

    renderLoginPage();

    fireEvent.change(screen.getByLabelText('כתובת אימייל'), {
      target: { value: 'bm@example.com' },
    });
    fireEvent.change(screen.getByLabelText('סיסמה'), {
      target: { value: 'Password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /התחברות/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/buildings-manager/dashboard');
    });
  });

  it('does NOT navigate when login credentials are wrong (401)', async () => {
    const { ApiError } = await import('@/lib/api/client');
    mockApiLogin.mockRejectedValueOnce(new ApiError('Unauthorized', 401));

    renderLoginPage();

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
    renderLoginPage();
    const links = screen.getAllByRole('link');
    const signupLink = links.find((l) => l.getAttribute('href') === '/signup');
    expect(signupLink).toBeDefined();
  });
});
