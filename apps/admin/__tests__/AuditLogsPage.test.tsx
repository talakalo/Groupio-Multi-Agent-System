import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import AuditLogsPage from '../app/settings/audit-logs/page';

const MOCK_AUDIT_LOGS = {
  items: [
    {
      id: 'log-1',
      user_email: 'admin@groupio.co.il',
      action: 'create',
      resource_type: 'user',
      resource_id: 'user-123',
      ip_address: '192.168.1.1',
      timestamp: '2026-01-26T10:00:00Z',
    },
    {
      id: 'log-2',
      user_email: 'admin2@groupio.co.il',
      action: 'update',
      resource_type: 'offer',
      resource_id: 'offer-456',
      ip_address: '192.168.1.2',
      timestamp: '2026-01-26T09:30:00Z',
    },
    {
      id: 'log-3',
      user_email: 'admin@groupio.co.il',
      action: 'login',
      resource_type: 'user',
      resource_id: 'admin-001',
      ip_address: '10.0.0.1',
      timestamp: '2026-01-26T08:00:00Z',
    },
  ],
  total: 3,
  page: 1,
  page_size: 25,
  total_pages: 1,
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

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders audit logs table with data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUDIT_LOGS,
    });

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('admin@groupio.co.il')).toBeInTheDocument();
      expect(screen.getByText('admin2@groupio.co.il')).toBeInTheDocument();
    });

    // Verify table headers
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Resource Type')).toBeInTheDocument();
    expect(screen.getByText('IP Address')).toBeInTheDocument();
  });

  it('shows action badges with correct labels', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUDIT_LOGS,
    });

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('create')).toBeInTheDocument();
      expect(screen.getByText('update')).toBeInTheDocument();
      expect(screen.getByText('login')).toBeInTheDocument();
    });
  });

  it('filters by action type when filters are shown', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_AUDIT_LOGS,
      })
      // Refetch after filter change
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...MOCK_AUDIT_LOGS,
          items: [MOCK_AUDIT_LOGS.items[0]],
          total: 1,
        }),
      });

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('admin@groupio.co.il')).toBeInTheDocument();
    });

    // Open filters panel
    const filtersButton = screen.getByRole('button', { name: /filters/i });
    fireEvent.click(filtersButton);

    // Select "Create" action filter
    await waitFor(() => {
      expect(screen.getByText('Action Type')).toBeInTheDocument();
    });

    const actionSelect = screen.getByLabelText('Action Type') || 
      screen.getAllByRole('combobox')[0];
    fireEvent.change(actionSelect, { target: { value: 'create' } });

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const filteredCall = calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('action=create')
      );
      expect(filteredCall).toBeDefined();
    });
  });

  it('triggers CSV export when clicking Export CSV button', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_AUDIT_LOGS,
    });

    // Mock URL.createObjectURL and other DOM APIs used for download
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock document.createElement for the download anchor
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    // Mock appendChild and removeChild
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node);

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('admin@groupio.co.il')).toBeInTheDocument();
    });

    // Click Export CSV button
    const exportButton = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(exportButton);

    // Verify the download was triggered
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toContain('audit-logs');
  });

  it('displays loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    // Loading spinner is shown
    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });

  it('displays error state on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Failed to fetch audit logs: 500')
    );

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/failed to load audit logs/i)).toBeInTheDocument();
    });
  });

  it('shows "no audit logs" when items are empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        page: 1,
        page_size: 25,
        total_pages: 0,
      }),
    });

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no audit logs found/i)).toBeInTheDocument();
    });
  });

  it('disables Export CSV button when no data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        page: 1,
        page_size: 25,
        total_pages: 0,
      }),
    });

    render(<AuditLogsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no audit logs found/i)).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export csv/i });
    expect(exportButton).toBeDisabled();
  });
});
