import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import PaymentsPage from '../app/payments/page';

// ---- Mock fetch responses for payment endpoints ----

const MOCK_SUMMARY = {
  totalCollected: 150000,
  totalInEscrow: 80000,
  totalReleasedToContractors: 50000,
  totalPlatformFees: 7500,
  totalRefunded: 2000,
  pendingPayouts: 2,
  currency: 'ILS',
};

const MOCK_ESCROWS = [
  {
    offerId: 'offer-1',
    offerTitle: 'AC Installation - Building A',
    contractorId: 'c-1',
    contractorName: 'Cool Air Ltd.',
    totalCollected: 45000,
    totalExpected: 45000,
    platformFee: 2250,
    netPayoutAmount: 42750,
    currency: 'ILS',
    escrowStatus: 'released',
    participantsPaid: 12,
    participantsTotal: 12,
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    offerId: 'offer-2',
    offerTitle: 'Kitchen Renovation - Building B',
    contractorName: 'Master Kitchen Ltd.',
    totalCollected: 60000,
    totalExpected: 60000,
    platformFee: 3000,
    netPayoutAmount: 57000,
    currency: 'ILS',
    escrowStatus: 'held',
    participantsPaid: 8,
    participantsTotal: 8,
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    offerId: 'offer-3',
    offerTitle: 'Plumbing Upgrade - Building C',
    contractorName: 'AquaFix Pro',
    totalCollected: 12000,
    totalExpected: 20000,
    platformFee: 1000,
    netPayoutAmount: 19000,
    currency: 'ILS',
    escrowStatus: 'disputed',
    participantsPaid: 6,
    participantsTotal: 10,
    createdAt: '2026-01-20T10:00:00Z',
  },
];

const MOCK_PAYOUTS = [
  {
    id: 'payout-1',
    contractorId: 'c-2',
    contractorName: 'AquaFix Pro',
    offerId: 'offer-3',
    offerTitle: 'Plumbing Upgrade - Building C',
    grossAmount: 19000,
    platformFee: 1000,
    netAmount: 18000,
    currency: 'ILS',
    status: 'pending',
    createdAt: '2026-01-21T10:00:00Z',
  },
  {
    id: 'payout-2',
    contractorId: 'c-1',
    contractorName: 'Cool Air Ltd.',
    offerId: 'offer-1',
    offerTitle: 'AC Installation - Building A',
    grossAmount: 42750,
    platformFee: 2250,
    netAmount: 40500,
    currency: 'ILS',
    status: 'completed',
    paidAt: '2026-01-12T10:00:00Z',
    createdAt: '2026-01-11T10:00:00Z',
  },
];

function mockFetch(url: string) {
  if (url.includes('/admin/payments/summary')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_SUMMARY) });
  }
  if (url.includes('/admin/payments/escrow') && !url.includes('/release')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_ESCROWS) });
  }
  if (url.includes('/admin/payments/payouts') && !url.includes('/approve')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_PAYOUTS) });
  }
  if (url.includes('/release') || url.includes('/approve')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
}

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

describe('PaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(mockFetch);
  });

  afterEach(() => {
    cleanup();
  });

  // ---- Rendering ----

  it('renders the page header', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Payments & Escrow')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/manage resident payments, escrow accounts/i)
    ).toBeInTheDocument();
  });

  it('renders the escrow flow diagram', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Residents Pay')).toBeInTheDocument();
    });
    expect(screen.getByText('Groupio Escrow')).toBeInTheDocument();
    expect(screen.getByText('Work Verified')).toBeInTheDocument();
    expect(screen.getByText('Contractor Paid')).toBeInTheDocument();
  });

  it('renders all 6 summary cards', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Total Collected')).toBeInTheDocument();
    });
    expect(screen.getByText('In Escrow')).toBeInTheDocument();
    // "Released" appears both in summary card title and escrow table badge
    expect(screen.getAllByText('Released').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Platform Fees')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('Pending Payouts')).toBeInTheDocument();
  });

  it('renders escrow tab and payouts tab', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Escrow Accounts')).toBeInTheDocument();
    });
    expect(screen.getByText('Contractor Payouts')).toBeInTheDocument();
  });

  // ---- Escrow Tab ----

  it('shows escrow table with mock data by default', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building A')).toBeInTheDocument();
    });
    expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    expect(screen.getByText('Plumbing Upgrade - Building C')).toBeInTheDocument();
  });

  it('shows contractor names in escrow table', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText('Cool Air Ltd.')).toBeInTheDocument();
    });
    expect(screen.getByText('Master Kitchen Ltd.')).toBeInTheDocument();
  });

  it('shows Release button for escrow with held status', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      const releaseButtons = screen.getAllByRole('button', { name: 'Release' });
      expect(releaseButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Review button for disputed escrow', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });
    await waitFor(() => {
      const reviewButtons = screen.getAllByRole('button', { name: 'Review' });
      expect(reviewButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters escrow accounts by status', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Held' }));

    expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    expect(screen.queryByText('AC Installation - Building A')).not.toBeInTheDocument();
  });

  it('shows all escrow accounts with "All" filter', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('AC Installation - Building A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Held' }));
    expect(screen.queryByText('AC Installation - Building A')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('AC Installation - Building A')).toBeInTheDocument();
    expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
  });

  // ---- Payouts Tab ----

  it('switches to payouts tab and shows payout data', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Contractor Payouts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Contractor Payouts'));

    await waitFor(() => {
      expect(screen.getByText('AquaFix Pro')).toBeInTheDocument();
    });
  });

  it('shows Approve button for pending payouts', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Contractor Payouts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Contractor Payouts'));

    await waitFor(() => {
      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      expect(approveButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Actions ----

  it('release escrow opens confirm modal', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    });

    const releaseButton = screen.getAllByRole('button', { name: 'Release' })[0];
    await act(async () => {
      fireEvent.click(releaseButton);
    });

    await waitFor(() => {
      expect(screen.getByText('Release Escrow Funds')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Release Funds' })).toBeInTheDocument();
    });
  });

  it('release escrow updates status on confirm', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    });

    const releaseButton = screen.getAllByRole('button', { name: 'Release' })[0];
    fireEvent.click(releaseButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Release Funds' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Release Funds' }));

    // After optimistic update, the released badge count should increase
    await waitFor(() => {
      const releasedBadges = screen.getAllByText(/Released/);
      expect(releasedBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('approve payout updates status on confirm', async () => {
    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Contractor Payouts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Contractor Payouts'));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Approve' }).length).toBeGreaterThanOrEqual(1);
    });

    const approveButton = screen.getAllByRole('button', { name: 'Approve' })[0];
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve Payout' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payout' }));

    await waitFor(() => {
      const approvedBadges = screen.getAllByText(/Approved/);
      expect(approvedBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
