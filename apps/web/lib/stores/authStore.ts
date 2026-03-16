import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// TODO: User overlaps with Resident/contractor profile from @groupio/types; consider sharing a base type.

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'resident' | 'contractor' | 'admin' | 'buildings_manager' | 'super_admin';
  preferredLanguage: 'he' | 'en';
  avatarUrl?: string;
  buildingId?: string;
  contractorId?: string;
  isVerified: boolean;
}

export interface AuthState {
  user: User | null;
  /** In-memory only – never persisted to localStorage. */
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;

  // Async actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Refresh the access token via the HTTP-only refresh cookie. */
  refreshAccessToken: () => Promise<boolean>;
  register: (data: RegisterData) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  role?: 'resident' | 'contractor';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setAccessToken: (accessToken) => {
        set({ accessToken, isAuthenticated: !!accessToken });
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('auth_token');
          document.cookie = 'groupio-auth=; path=/; max-age=0';
        }
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
        });
      },

      setLoading: (isLoading) => set({ isLoading }),

      login: async (email, password) => {
        set({ isLoading: true });

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/login/json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // receive HTTP-only refresh cookie
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
          }

          const data = await response.json();
          // Only keep the access token in memory – refresh token
          // is stored as an HTTP-only cookie by the backend.
          set({
            accessToken: data.access_token,
            isAuthenticated: true,
          });

          // Fetch user profile
          const userResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
            },
            credentials: 'include',
          });

          if (userResponse.ok) {
            const user = await userResponse.json();
            set({ user });
          }
        } catch (err) {
          // Always re-throw as a proper Error so callers never receive a raw
          // DOM Event or other non-Error rejection value (which Next.js dev
          // overlay would display as "[object Event]").
          if (err instanceof Error) throw err;
          throw new Error(String(err));
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        const { accessToken } = get();
        set({ isLoading: true });

        try {
          if (accessToken) {
            await fetch(`${API_URL}/api/v1/auth/logout`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
              credentials: 'include', // clear HTTP-only refresh cookie
            }).catch(() => {});
          }
        } finally {
          get().clearAuth();
          set({ isLoading: false });
        }
      },

      refreshAccessToken: async () => {
        // No refresh token in state – the browser sends the HTTP-only
        // cookie automatically when credentials: 'include' is set.
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });

          if (!response.ok) {
            get().clearAuth();
            return false;
          }

          const data = await response.json();
          set({ accessToken: data.access_token });

          return true;
        } catch {
          get().clearAuth();
          return false;
        }
      },

      register: async (data) => {
        set({ isLoading: true });

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email: data.email,
              password: data.password,
              full_name: data.fullName,
              phone: data.phone,
              role: data.role || 'resident',
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Registration failed');
          }

          // Auto-login after registration
          await get().login(data.email, data.password);
        } catch (err) {
          if (err instanceof Error) throw err;
          throw new Error(String(err));
        } finally {
          set({ isLoading: false });
        }
      },

      updateProfile: async (data) => {
        const { accessToken, user } = get();

        if (!accessToken || !user) {
          throw new Error('Not authenticated');
        }

        set({ isLoading: true });

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/me`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            credentials: 'include',
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Update failed');
          }

          const updatedUser = await response.json();
          set({ user: updatedUser });
        } catch (err) {
          if (err instanceof Error) throw err;
          throw new Error(String(err));
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'groupio-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist non-sensitive data. Tokens are NEVER written to
      // localStorage – the access token lives in memory and the refresh
      // token lives in an HTTP-only cookie managed by the backend.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selector hooks for better performance
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsAdmin = () =>
  useAuthStore((state) =>
    state.user?.role === 'admin' ||
    state.user?.role === 'buildings_manager' ||
    state.user?.role === 'super_admin'
  );
export const useIsBuildingsManager = () =>
  useAuthStore((state) => state.user?.role === 'buildings_manager');
export const useIsContractor = () =>
  useAuthStore((state) => state.user?.role === 'contractor');
export const useAccessToken = () => useAuthStore((state) => state.accessToken);
