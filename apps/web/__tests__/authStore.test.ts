import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../lib/stores/authStore';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    get store() { return store; },
    set store(val: Record<string, string>) { store = val; },
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
};

const localStorageMock = createLocalStorageMock();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Auth Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  describe('setUser', () => {
    it('sets user and marks as authenticated', () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '0501234567',
        role: 'resident' as const,
        preferredLanguage: 'he' as const,
        isVerified: true,
      };

      useAuthStore.getState().setUser(user);

      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('clears authentication when user is null', () => {
      useAuthStore.getState().setUser(null);

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('setAccessToken', () => {
    it('stores token and marks as authenticated', () => {
      useAuthStore.getState().setAccessToken('access-token');

      expect(useAuthStore.getState().accessToken).toBe('access-token');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('clears auth when token is null', () => {
      useAuthStore.getState().setAccessToken('access-token');
      useAuthStore.getState().setAccessToken(null);

      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('clearAuth', () => {
    it('clears all auth state', () => {
      useAuthStore.getState().setUser({
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '0501234567',
        role: 'resident',
        preferredLanguage: 'he',
        isVerified: true,
      });
      useAuthStore.getState().setAccessToken('access');

      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('successfully logs in user with credentials include', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'user-123',
            email: 'test@example.com',
            full_name: 'Test User',
            role: 'resident',
          }),
        });

      await useAuthStore.getState().login('test@example.com', 'password123');

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe('new-access-token');

      // Verify credentials: 'include' on the login fetch call
      const loginCallOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(loginCallOptions.credentials).toBe('include');
    });

    it('throws error on invalid credentials', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Invalid credentials' }),
      });

      await expect(
        useAuthStore.getState().login('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('sets loading state during login', async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        await promise;
        return {
          ok: true,
          json: async () => ({
            access_token: 'token',
          }),
        };
      });

      const loginPromise = useAuthStore.getState().login('test@example.com', 'password');

      expect(useAuthStore.getState().isLoading).toBe(true);

      resolvePromise!();
      await loginPromise.catch(() => {});

      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears auth state and sends credentials include', async () => {
      useAuthStore.getState().setAccessToken('access');
      useAuthStore.getState().setUser({
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
        phone: '0501234567',
        role: 'resident',
        preferredLanguage: 'he',
        isVerified: true,
      });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      // Verify credentials: 'include' on the logout fetch call
      const logoutCallOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(logoutCallOptions.credentials).toBe('include');
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes via HTTP-only cookie (no token in state needed)', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
        }),
      });

      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe('new-access-token');

      // Verify credentials: 'include' is set
      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.credentials).toBe('include');
    });

    it('clears auth on refresh failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
      });

      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('register', () => {
    it('registers and logs in user', async () => {
      const mockJson = (data: object) => () => Promise.resolve(data);
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: mockJson({ id: 'new-user-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'access-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: mockJson({
            id: 'new-user-123',
            email: 'new@example.com',
            full_name: 'New User',
            role: 'resident',
          }),
        });

      await useAuthStore.getState().register({
        email: 'new@example.com',
        password: 'password123',
        fullName: 'New User',
        phone: '0501234567',
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  describe('persistence', () => {
    it('does not persist accessToken to localStorage', () => {
      useAuthStore.getState().setAccessToken('secret-token');

      // The partialize function should exclude accessToken
      const persisted = localStorageMock.store['groupio-auth'];
      if (persisted) {
        const parsed = JSON.parse(persisted);
        expect(parsed.state).not.toHaveProperty('accessToken');
      }
    });
  });
});
