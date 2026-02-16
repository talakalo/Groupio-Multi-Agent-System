import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import LoginPage from '../app/login/page';

// Re-mock useRouter so we can spy on push
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders login form with email input, password input, and login button', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows validation error on empty submit (HTML5 required prevents submit)', async () => {
    render(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    // The button should be disabled when email and password are empty
    expect(submitButton).toBeDisabled();
  });

  it('transitions to 2FA step after successful credentials submission', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'temp-token-123' }),
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'admin@groupio.co.il' } });
    fireEvent.change(passwordInput, { target: { value: 'AdminSecure123!' } });

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/two-factor authentication/i)).toBeInTheDocument();
    });

    // Verify TOTP input fields appear (6 digit inputs)
    const totpInputs = screen.getAllByRole('textbox');
    expect(totpInputs.length).toBe(6);
  });

  it('shows error message on failed login (401)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid credentials' }),
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'admin@groupio.co.il' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('redirects to /dashboard after successful 2FA verification', async () => {
    // Step 1: Login returns token (moves to 2FA step)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'temp-token-123' }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'admin@groupio.co.il' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'AdminSecure123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/two-factor authentication/i)).toBeInTheDocument();
    });

    // Step 2: 2FA verification succeeds
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'final-token' }),
    });

    // Fill in 6-digit TOTP code
    const totpInputs = screen.getAllByRole('textbox');
    const digits = ['1', '2', '3', '4', '5', '6'];
    digits.forEach((digit, idx) => {
      fireEvent.change(totpInputs[idx], { target: { value: digit } });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows error message on failed 2FA verification', async () => {
    // Step 1: Login succeeds
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'temp-token-123' }),
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'admin@groupio.co.il' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'AdminSecure123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/two-factor authentication/i)).toBeInTheDocument();
    });

    // Step 2: 2FA fails
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid verification code' }),
    });

    const totpInputs = screen.getAllByRole('textbox');
    ['1', '2', '3', '4', '5', '6'].forEach((digit, idx) => {
      fireEvent.change(totpInputs[idx], { target: { value: digit } });
    });

    await waitFor(() => {
      expect(screen.getByText(/invalid verification code/i)).toBeInTheDocument();
    });
  });
});
