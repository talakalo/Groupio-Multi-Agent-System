import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: 'resident' | 'contractor' | 'admin' | 'super_admin';
  preferredLanguage: 'he' | 'en';
  avatarUrl?: string;
  buildingId?: string;
  contractorId?: string;
  isVerified: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;

  // Async actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setTokens: (accessToken, refreshToken) => {
        if (typeof window !== 'undefined') window.localStorage.setItem('auth_token', accessToken);
        set({
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('auth_token');
          // Clear the auth cookie for both http and https
          document.cookie = 'groupio-auth=; path=/; max-age=0; samesite=lax';
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
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
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
          }

          const data = await response.json();
          if (typeof window !== 'undefined') window.localStorage.setItem('auth_token', data.access_token);
          set({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            isAuthenticated: true,
          });

          // Fetch user profile
          const userResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: {
              Authorization: `Bearer ${data.access_token}`,
            },
          });

          if (userResponse.ok) {
            const user = await userResponse.json();
            set({ user });
          }
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
            }).catch(() => {});
          }
        } finally {
          get().clearAuth();
          set({ isLoading: false });
        }
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();

        if (!refreshToken) {
          get().clearAuth();
          return false;
        }

        try {
          const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (!response.ok) {
            get().clearAuth();
            return false;
          }

      const data = await response.json();
      if (typeof window !== 'undefined') window.localStorage.setItem('auth_token', data.access_token);
      set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });

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
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Update failed');
          }

          const updatedUser = await response.json();
          set({ user: updatedUser });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'groupio-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
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
    state.user?.role === 'admin' || state.user?.role === 'super_admin'
  );
export const useIsContractor = () =>
  useAuthStore((state) => state.user?.role === 'contractor');
export const useAccessToken = () => useAuthStore((state) => state.accessToken);
