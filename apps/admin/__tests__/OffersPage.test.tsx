import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import OffersPage from '../app/offers/page';

const MOCK_OFFERS = [
  {
    id: 'offer-1',
    title: 'AC Installation - Building 15',
    category: 'ac_installation',
    building: 'Rothschild 15',
    status: 'pending',
    participants: 8,
    price: 4500,
    flagged: false,
    created_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'offer-2',
    title: 'Kitchen Renovation Group Buy',
    category: 'kitchen',
    building: 'Dizengoff 100',
    status: 'matched',
    participants: 5,
    price: 25000,
    flagged: true,
    created_at: '2026-01-18T10:00:00Z',
  },
  {
    id: 'offer-3',
    title: 'Plumbing Fix',
    category: 'plumbing',
    building: null,
    status: 'completed',
    participants: 3,
    price: 1800,
    flagged: false,
    created_at: '2026-01-10T10:00:00Z',
  },
];

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

describe('OffersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders offers table with data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ offers: MOCK_OFFERS }),
    });

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building 15')).toBeInTheDocument();
      expect(screen.getByText('Kitchen Renovation Group Buy')).toBeInTheDocument();
      expect(screen.getByText('Plumbing Fix')).toBeInTheDocument();
    });

    // Verify table structure
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('filters offers by status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ offers: MOCK_OFFERS }),
    });

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building 15')).toBeInTheDocument();
    });

    // Select "Pending" status filter
    const statusSelect = screen.getAllByRole('combobox')[0]; // First select is status
    fireEvent.change(statusSelect, { target: { value: 'pending' } });

    // Only pending offers should be visible
    expect(screen.getByText('AC Installation - Building 15')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen Renovation Group Buy')).not.toBeInTheDocument();
    expect(screen.queryByText('Plumbing Fix')).not.toBeInTheDocument();
  });

  it('approves a flagged offer via action dropdown', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      // Initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ offers: MOCK_OFFERS }),
      })
      // Approve call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      // Refetch after invalidation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ offers: MOCK_OFFERS }),
      });

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kitchen Renovation Group Buy')).toBeInTheDocument();
    });

    // Open action dropdown for the flagged offer (offer-2)
    // Find the actions buttons (MoreHorizontal icons)
    const actionButtons = screen.getAllByRole('button').filter(
      (btn) => btn.classList.contains('btn-ghost')
    );
    // The flagged offer is the second row
    fireEvent.click(actionButtons[1]);

    // Click "Approve" in the dropdown
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const approveCall = calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/approve') &&
          call[1]?.method === 'POST'
      );
      expect(approveCall).toBeDefined();
    });
  });

  it('flags an unflagged offer via action dropdown', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ offers: MOCK_OFFERS }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ offers: MOCK_OFFERS }),
      });

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building 15')).toBeInTheDocument();
    });

    // Open action dropdown for the first offer (unflagged)
    const actionButtons = screen.getAllByRole('button').filter(
      (btn) => btn.classList.contains('btn-ghost')
    );
    fireEvent.click(actionButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Flag for Review')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Flag for Review'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const flagCall = calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/flag') &&
          call[1]?.method === 'POST'
      );
      expect(flagCall).toBeDefined();
    });
  });

  it('displays stats cards correctly', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ offers: MOCK_OFFERS }),
    });

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Total Offers')).toBeInTheDocument();
      expect(screen.getByText('Flagged')).toBeInTheDocument();
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<OffersPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading offers/i)).toBeInTheDocument();
  });

  it('displays error state on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<OffersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/failed to load offers/i)).toBeInTheDocument();
    });
  });
});
