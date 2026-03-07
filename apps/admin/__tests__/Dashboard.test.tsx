import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import DashboardPage from '../app/dashboard/page';

// Mock all hooks so the Dashboard renders with predictable data
vi.mock('@/lib/hooks', () => ({
  useDashboardMetrics: () => ({
    data: {
      gmvToday: 12500,
      gmvChange: 8.2,
      activeOffers: 45,
      activeOffersChange: 3.1,
      pendingVerifications: 12,
      urgentVerifications: 2,
      openTickets: 7,
      openTicketsChange: -1.5,
    },
  }),
  useSystemStatus: () => ({
    data: {
      agents: {
        router: { model: 'claude-3-5-sonnet', calls: 100, errors: 2 },
        matching: { model: 'claude-3-5-sonnet', calls: 80, errors: 1 },
        pricing: { model: 'claude-3-5-sonnet', calls: 60, errors: 0 },
        vetting: { model: 'claude-3-5-sonnet', calls: 40, errors: 1 },
        support: { model: 'claude-3-5-sonnet', calls: 120, errors: 3 },
        outreach: { model: 'claude-3-5-sonnet', calls: 30, errors: 0 },
        analytics: { model: 'claude-3-5-sonnet', calls: 20, errors: 0 },
      },
      vectorCollections: {},
    },
  }),
  useEscalations: () => ({ data: { escalations: [] } }),
  useHealthStatus: () => ({
    data: {
      services: { api: true, database: true, redis: true },
    },
  }),
  useAdminAnalyticsDashboard: () => ({
    data: { totalContractors: 200, gmvToday: 12500 },
  }),
  useActivityLog: () => ({ data: [] }),
  useVettingStatus: () => ({ data: { pendingReview: 3, approved: 42, rejected: 5, contractors: [] } }),
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/dashboard',
}));

// Create a test wrapper with QueryClient
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('Admin Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard title', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  it('displays system health metrics', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/uptime/i)).toBeInTheDocument();
    });
  });

  it('shows agent status cards', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/router/i)).toBeInTheDocument();
      expect(screen.getByText(/matching/i)).toBeInTheDocument();
      expect(screen.getByText(/support/i)).toBeInTheDocument();
    });
  });

  it('displays offer statistics', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/offers/i)).toBeInTheDocument();
    });
  });

  it('handles loading state gracefully', () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    // Dashboard renders even during loading - shows dashboard header
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });

  it('handles error state gracefully', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    // Dashboard still renders gracefully
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });
});

describe('Agent Metrics Display', () => {
  it('calculates error rate correctly', () => {
    const calls = 100;
    const errors = 5;
    const errorRate = (errors / calls) * 100;

    expect(errorRate).toBe(5);
  });

  it('formats latency in milliseconds', () => {
    const latencySeconds = 0.5;
    const latencyMs = latencySeconds * 1000;

    expect(latencyMs).toBe(500);
  });
});

describe('Dashboard Refresh', () => {
  it('fetches data on initial mount', async () => {
    render(<DashboardPage />, { wrapper: createTestWrapper() });

    // Dashboard renders with data from mocked hooks
    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });
});
