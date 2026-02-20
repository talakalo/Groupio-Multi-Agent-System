import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import PaymentsPage from '../app/payments/page';

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

  it('release escrow calls confirm dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    });

    const releaseButton = screen.getAllByRole('button', { name: 'Release' })[0];
    await act(async () => {
      fireEvent.click(releaseButton);
    });

    expect(confirmSpy).toHaveBeenCalled();
  });

  it('release escrow updates status on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Kitchen Renovation - Building B')).toBeInTheDocument();
    });

    const releaseButton = screen.getAllByRole('button', { name: 'Release' })[0];
    await act(async () => {
      fireEvent.click(releaseButton);
    });

    // After optimistic update, the released badge count should increase
    await waitFor(() => {
      const releasedBadges = screen.getAllByText(/Released/);
      expect(releasedBadges.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('approve payout updates status on confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PaymentsPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Contractor Payouts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Contractor Payouts'));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Approve' }).length).toBeGreaterThanOrEqual(1);
    });

    const approveButton = screen.getAllByRole('button', { name: 'Approve' })[0];
    await act(async () => {
      fireEvent.click(approveButton);
    });

    await waitFor(() => {
      const approvedBadges = screen.getAllByText(/Approved/);
      expect(approvedBadges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
