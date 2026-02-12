import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import UsersPage from '../app/users/page';

const MOCK_USERS = [
  {
    id: 'u1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0541234567',
    role: 'resident',
    status: 'active',
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'u2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '0549876543',
    role: 'admin',
    status: 'active',
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'u3',
    name: 'Bob Suspended',
    email: 'bob@example.com',
    phone: null,
    role: 'contractor',
    status: 'suspended',
    created_at: '2025-12-01T10:00:00Z',
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

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  it('renders users table with data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: MOCK_USERS }),
    });

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Suspended')).toBeInTheDocument();
    });

    // Verify table headers exist
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('filters users by search query', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: MOCK_USERS }),
    });

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Type in the search box
    const searchInput = screen.getByPlaceholderText(/search by name, email, or phone/i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    // Jane should be visible, others should not
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Suspended')).not.toBeInTheDocument();
  });

  it('toggles user suspend/activate status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      // Initial fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: MOCK_USERS }),
      })
      // Update call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...MOCK_USERS[0], status: 'suspended' }),
      })
      // Refetch after invalidation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: MOCK_USERS }),
      });

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click suspend button for first active user
    const suspendButtons = screen.getAllByText(/suspend/i);
    fireEvent.click(suspendButtons[0]);

    await waitFor(() => {
      // Verify the PUT request was made with correct status
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const updateCall = calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/api/v1/admin/users/') &&
          call[1]?.method === 'PUT'
      );
      expect(updateCall).toBeDefined();
      const body = JSON.parse(updateCall![1].body);
      expect(body.status).toBe('suspended');
    });
  });

  it('opens create admin user dialog', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: MOCK_USERS }),
    });

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click "Create Admin User" button
    const createButton = screen.getByRole('button', { name: /create admin user/i });
    fireEvent.click(createButton);

    // Verify the create user modal appears with form fields
    await waitFor(() => {
      expect(screen.getByText('Create Admin User')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('admin@groupio.co.il')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/\+972/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/minimum 8 characters/i)).toBeInTheDocument();
    });
  });

  it('displays loading state', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );

    render(<UsersPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
  });

  it('displays error state on fetch failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/failed to load users/i)).toBeInTheDocument();
    });
  });

  it('displays stats cards', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ users: MOCK_USERS }),
    });

    render(<UsersPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Suspended')).toBeInTheDocument();
      expect(screen.getByText('Admins')).toBeInTheDocument();
    });
  });
});
