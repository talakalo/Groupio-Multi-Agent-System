import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import SettingsPage from '../app/settings/page';

const MOCK_SETTINGS = {
  general: {
    platformName: 'Groupio',
    supportEmail: 'support@groupio.co.il',
    defaultLanguage: 'he',
  },
  notifications: {
    emailEnabled: true,
    whatsappEnabled: true,
    pushEnabled: false,
    templates: ['welcome', 'offer_created', 'match_found', 'payment_confirmation'],
  },
  agents: [
    { key: 'router', name: 'Router', enabled: true, confidenceThreshold: 0.85, temperature: 0.3 },
    { key: 'matching', name: 'Matching', enabled: true, confidenceThreshold: 0.8, temperature: 0.4 },
  ],
  security: {
    rateLimitPerUser: 100,
    jwtExpiryMinutes: 60,
    enforce2FA: true,
    corsOrigins: 'https://app.groupio.co.il\nhttps://admin.groupio.co.il',
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders settings tabs: General, Notifications, Agents, Security', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SETTINGS,
    });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Agents')).toBeInTheDocument();
      expect(screen.getByText('Security')).toBeInTheDocument();
    });
  });

  it('shows general settings by default', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SETTINGS,
    });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
      expect(screen.getByText('Platform Name')).toBeInTheDocument();
      expect(screen.getByText('Support Email')).toBeInTheDocument();
      expect(screen.getByText('Default Language')).toBeInTheDocument();
    });
  });

  it('switches to Security tab and shows security settings', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SETTINGS,
    });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    // Click Security tab
    fireEvent.click(screen.getByText('Security'));

    await waitFor(() => {
      expect(screen.getByText('Security Settings')).toBeInTheDocument();
      expect(screen.getByText(/rate limit per user/i)).toBeInTheDocument();
      expect(screen.getByText(/jwt expiry/i)).toBeInTheDocument();
      expect(screen.getByText(/enforce 2fa for all admin users/i)).toBeInTheDocument();
      expect(screen.getByText(/cors origins/i)).toBeInTheDocument();
    });
  });

  it('saves settings when Save button is clicked', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      // Initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_SETTINGS,
      })
      // Save call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_SETTINGS,
      })
      // Refetch after invalidation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_SETTINGS,
      });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    // Modify the platform name
    const platformNameInput = screen.getByDisplayValue('Groupio');
    fireEvent.change(platformNameInput, { target: { value: 'Groupio Updated' } });

    // Click Save Changes button (there are two save buttons, use the top one)
    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const saveCall = calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/api/v1/admin/settings') &&
          call[1]?.method === 'PUT'
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse(saveCall![1].body);
      expect(body.general.platformName).toBe('Groupio Updated');
    });
  });

  it('switches to Notifications tab', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SETTINGS,
    });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Notifications'));

    await waitFor(() => {
      expect(screen.getByText('Notification Channels')).toBeInTheDocument();
      expect(screen.getByText('Email Notifications')).toBeInTheDocument();
      expect(screen.getByText('WhatsApp Notifications')).toBeInTheDocument();
      expect(screen.getByText('Push Notifications')).toBeInTheDocument();
    });
  });

  it('switches to Agents tab and shows agent config', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_SETTINGS,
    });

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('General Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Agents'));

    await waitFor(() => {
      expect(screen.getByText('Agent Configuration')).toBeInTheDocument();
      expect(screen.getByText('Router')).toBeInTheDocument();
      expect(screen.getByText('Matching')).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<SettingsPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it('displays error state on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    render(<SettingsPage />, { wrapper: createWrapper() });

    await waitFor(
      () => {
        expect(
          screen.getByText((content) => content.includes('Failed to load settings') || content.includes('Using defaults'))
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });
});
