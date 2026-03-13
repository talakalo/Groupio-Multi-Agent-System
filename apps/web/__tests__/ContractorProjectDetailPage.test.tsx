import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'offer-123' }),
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    if (key.startsWith('categories.')) return key;
    if (key.startsWith('contractor.projects.')) return key;
    return key;
  },
}));

let mockAccessToken: string | null = 'token-123';
const mockRefreshAccessToken = vi.fn(() => Promise.resolve(true));

vi.mock('@/lib/stores/authStore', () => {
  const useAuthStore = Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        accessToken: mockAccessToken,
        isAuthenticated: !!mockAccessToken,
        refreshAccessToken: mockRefreshAccessToken,
      })
    ),
    {
      getState: () => ({
        accessToken: mockAccessToken,
        isAuthenticated: !!mockAccessToken,
        refreshAccessToken: mockRefreshAccessToken,
      }),
    }
  );
  return { useAuthStore };
});

// Must import after mocks
import ContractorProjectDetailPage from '../app/contractor/projects/[id]/page';

describe('ContractorProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessToken = 'token-123';
    global.fetch = vi.fn();
  });

  it('shows loading spinner initially', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );
    render(<ContractorProjectDetailPage />);
    expect(
      document.querySelector('.animate-spin.rounded-full')
    ).toBeInTheDocument();
  });

  it('shows error state when project not found', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
    render(<ContractorProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Project not found')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /חזרה לפרויקטים/ })).toHaveAttribute(
      'href',
      '/contractor/projects'
    );
  });

  it('renders project details when fetch succeeds', async () => {
    const mockOffer = {
      id: 'offer-123',
      title: 'AC Installation',
      description: 'Group AC installation',
      category: 'ac_installation',
      base_price: 5000,
      building_id: 'bld-001',
      status: 'in_progress',
      current_participants: 8,
      created_at: '2025-01-15T10:00:00Z',
      deadline: '2025-02-15T10:00:00Z',
      pricing_tiers: [
        {
          min_participants: 3,
          max_participants: 5,
          discount_percent: 5,
          price_per_unit: 4750,
        },
        {
          min_participants: 6,
          max_participants: 10,
          discount_percent: 10,
          price_per_unit: 4500,
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOffer),
    });

    render(<ContractorProjectDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('AC Installation')).toBeInTheDocument();
    });

    expect(screen.getByText(/5[,.]?000/)).toBeInTheDocument();
    expect(screen.getByText(/8\s+participants/)).toBeInTheDocument();
    expect(screen.getByText('Group AC installation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /חזרה לפרויקטים/ })).toHaveAttribute(
      'href',
      '/contractor/projects'
    );
  });

  it('redirects to login when no token', async () => {
    mockAccessToken = null;
    render(<ContractorProjectDetailPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
