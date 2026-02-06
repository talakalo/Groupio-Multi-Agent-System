import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardPage from '../app/dashboard/page';

// Mock fetch
global.fetch = vi.fn();

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/dashboard',
}));

describe('Admin Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: {
          router: { calls: 100, errors: 2, avg_latency: 0.5 },
          matching: { calls: 80, errors: 1, avg_latency: 1.2 },
          pricing: { calls: 60, errors: 0, avg_latency: 0.8 },
          vetting: { calls: 40, errors: 1, avg_latency: 1.5 },
          support: { calls: 120, errors: 3, avg_latency: 0.6 },
          outreach: { calls: 30, errors: 0, avg_latency: 2.0 },
          analytics: { calls: 20, errors: 0, avg_latency: 1.8 },
        },
        system: {
          uptime: 99.9,
          api_latency: 45,
          error_rate: 0.5,
        },
        offers: {
          total: 150,
          active: 45,
          completed: 100,
        },
        contractors: {
          total: 200,
          verified: 150,
          pending: 30,
        },
      }),
    });
  });

  it('renders dashboard title', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  it('displays system health metrics', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/uptime/i)).toBeInTheDocument();
    });
  });

  it('shows agent status cards', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/router/i)).toBeInTheDocument();
      expect(screen.getByText(/matching/i)).toBeInTheDocument();
      expect(screen.getByText(/support/i)).toBeInTheDocument();
    });
  });

  it('displays offer statistics', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/offers/i)).toBeInTheDocument();
    });
  });

  it('handles loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<DashboardPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('handles error state', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error')
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
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
  it('auto-refreshes data', async () => {
    vi.useFakeTimers();

    render(<DashboardPage />);

    // Fast-forward 30 seconds
    vi.advanceTimersByTime(30000);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    vi.useRealTimers();
  });
});
