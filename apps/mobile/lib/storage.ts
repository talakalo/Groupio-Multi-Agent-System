import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const AUTH_KEY = 'groupio_auth';
const USER_KEY = 'groupio_user';
const SETTINGS_KEY = 'groupio_settings';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  buildingId?: string;
  contractorId?: string;
}

export interface StoredSettings {
  language: 'he' | 'en';
  notifications: boolean;
  biometricEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

/**
 * Secure storage for sensitive data (tokens)
 */
export const secureStorage = {
  async setAuth(auth: StoredAuth): Promise<void> {
    try {
      await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify(auth));
    } catch (error) {
      console.error('Failed to store auth:', error);
      throw error;
    }
  },

  async getAuth(): Promise<StoredAuth | null> {
    try {
      const value = await SecureStore.getItemAsync(AUTH_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Failed to get auth:', error);
      return null;
    }
  },

  async clearAuth(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(AUTH_KEY);
    } catch (error) {
      console.error('Failed to clear auth:', error);
    }
  },

  async isAuthenticated(): Promise<boolean> {
    const auth = await this.getAuth();
    if (!auth) return false;

    // Check if token is expired
    const now = Date.now();
    return auth.expiresAt > now;
  },
};

/**
 * Regular storage for non-sensitive data
 */
export const storage = {
  async setUser(user: StoredUser): Promise<void> {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Failed to store user:', error);
    }
  },

  async getUser(): Promise<StoredUser | null> {
    try {
      const value = await AsyncStorage.getItem(USER_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Failed to get user:', error);
      return null;
    }
  },

  async clearUser(): Promise<void> {
    try {
      await AsyncStorage.removeItem(USER_KEY);
    } catch (error) {
      console.error('Failed to clear user:', error);
    }
  },

  async setSettings(settings: StoredSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to store settings:', error);
    }
  },

  async getSettings(): Promise<StoredSettings> {
    try {
      const value = await AsyncStorage.getItem(SETTINGS_KEY);
      if (value) {
        return JSON.parse(value);
      }
    } catch (error) {
      console.error('Failed to get settings:', error);
    }

    // Return defaults
    return {
      language: 'he',
      notifications: true,
      biometricEnabled: false,
      theme: 'system',
    };
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([USER_KEY, SETTINGS_KEY]);
      await secureStorage.clearAuth();
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  },
};

/**
 * Cache helper for API responses
 */
export const cache = {
  async set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): Promise<void> {
    try {
      const item = {
        data,
        expiresAt: Date.now() + ttlMs,
      };
      await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to cache:', error);
    }
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(`cache_${key}`);
      if (!value) return null;

      const item = JSON.parse(value);
      if (Date.now() > item.expiresAt) {
        await this.delete(key);
        return null;
      }

      return item.data as T;
    } catch (error) {
      console.error('Failed to get from cache:', error);
      return null;
    }
  },

  async delete(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`cache_${key}`);
    } catch (error) {
      console.error('Failed to delete from cache:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith('cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  },
};
