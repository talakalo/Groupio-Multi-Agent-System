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
      refreshToken: null,
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

  describe('setTokens', () => {
    it('stores tokens and marks as authenticated', () => {
      useAuthStore.getState().setTokens('access-token', 'refresh-token');

      expect(useAuthStore.getState().accessToken).toBe('access-token');
      expect(useAuthStore.getState().refreshToken).toBe('refresh-token');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
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
      useAuthStore.getState().setTokens('access', 'refresh');

      useAuthStore.getState().clearAuth();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('successfully logs in user', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
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
            refresh_token: 'refresh',
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
    it('clears auth state on logout', async () => {
      useAuthStore.getState().setTokens('access', 'refresh');
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
    });
  });

  describe('refreshAccessToken', () => {
    it('refreshes tokens successfully', async () => {
      useAuthStore.getState().setTokens('old-access', 'old-refresh');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      });

      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(true);
      expect(useAuthStore.getState().accessToken).toBe('new-access-token');
    });

    it('clears auth on refresh failure', async () => {
      useAuthStore.getState().setTokens('old-access', 'old-refresh');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
      });

      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('returns false when no refresh token exists', async () => {
      const result = await useAuthStore.getState().refreshAccessToken();

      expect(result).toBe(false);
    });
  });

  describe('register', () => {
    it('registers and logs in user', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'new-user-123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
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
});
