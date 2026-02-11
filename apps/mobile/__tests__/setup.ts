import { vi, afterEach } from 'vitest';
import React from 'react';

// Mock @testing-library/react-native (it fails to load RN host components in Node)
vi.mock('@testing-library/react-native', () => {
  /* Lightweight render that returns query helpers over a simple component tree */
  const findAllByProp = (tree: any, prop: string, match: string | RegExp): any[] => {
    const results: any[] = [];
    const walk = (node: any) => {
      if (!node) return;
      const val = node.props?.[prop];
      if (val && (typeof match === 'string' ? val === match : match.test(String(val)))) results.push(node);
      if (node.props?.testID && prop === 'testID' && (typeof match === 'string' ? node.props.testID === match : match.test(node.props.testID))) results.push(node);
      const children = node.props?.children;
      if (Array.isArray(children)) children.forEach(walk);
      else if (children && typeof children === 'object') walk(children);
    };
    walk(tree);
    return results;
  };

  const getTextNodes = (tree: any): string[] => {
    const texts: string[] = [];
    const walk = (node: any) => {
      if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return; }
      if (!node?.props) return;
      const ch = node.props.children;
      if (Array.isArray(ch)) ch.forEach(walk);
      else walk(ch);
    };
    walk(tree);
    return texts;
  };

  const render = (element: React.ReactElement) => {
    // Use react-test-renderer to create a JSON tree
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { create } = require('react-test-renderer');
    const root = create(element);
    const tree = root.toJSON();

    const getByText = (match: string | RegExp) => {
      const walk = (node: any): any => {
        if (!node) return null;
        const texts = getTextNodes(node);
        const joined = texts.join('');
        if (typeof match === 'string' ? joined.includes(match) : match.test(joined)) return node;
        const children = node.props?.children;
        if (Array.isArray(children)) {
          for (const c of children) { const r = walk(c); if (r) return r; }
        } else if (children && typeof children === 'object') { return walk(children); }
        return null;
      };
      const found = walk(tree);
      if (!found) throw new Error(`Unable to find text: ${match}`);
      return found;
    };

    const getByTestId = (id: string) => {
      const walk = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (node.props?.testID === id) return node;
        const ch = node.props?.children;
        if (Array.isArray(ch)) {
          for (const c of ch) { const r = walk(c); if (r) return r; }
        } else if (ch && typeof ch === 'object') { return walk(ch); }
        return null;
      };
      const found = walk(tree);
      if (!found) throw new Error(`Unable to find testID: ${id}`);
      return found;
    };

    const queryByText = (match: string | RegExp) => {
      try { return getByText(match); } catch { return null; }
    };

    const getByLabelText = (match: string | RegExp) => {
      const walk = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        const label = node.props?.accessibilityLabel || node.props?.['aria-label'] || '';
        if (typeof match === 'string' ? label.includes(match) : match.test(label)) return node;
        const ch = node.props?.children;
        if (Array.isArray(ch)) {
          for (const c of ch) { const r = walk(c); if (r) return r; }
        } else if (ch && typeof ch === 'object') { return walk(ch); }
        return null;
      };
      const found = walk(tree);
      if (!found) throw new Error(`Unable to find accessibilityLabel: ${match}`);
      return found;
    };

    const getByRole = (role: string) => {
      const walk = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (node.props?.accessibilityRole === role || node.props?.role === role) return node;
        const ch = node.props?.children;
        if (Array.isArray(ch)) {
          for (const c of ch) { const r = walk(c); if (r) return r; }
        } else if (ch && typeof ch === 'object') { return walk(ch); }
        return null;
      };
      const found = walk(tree);
      if (!found) throw new Error(`Unable to find role: ${role}`);
      return found;
    };

    return { getByText, getByTestId, queryByText, getByLabelText, getByRole, unmount: () => root.unmount(), root };
  };

  const fireEvent = {
    press: (node: any) => { node?.props?.onPress?.(); },
    changeText: (node: any, text: string) => { node?.props?.onChangeText?.(text); },
  };

  return { render, fireEvent };
});

// Mock React Native modules
vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: vi.fn((obj) => obj.ios),
  },
  Dimensions: {
    get: vi.fn(() => ({ width: 375, height: 812 })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  StyleSheet: {
    create: (styles: Record<string, object>) => styles,
    flatten: (style: object) => style,
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Image: 'Image',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Alert: {
    alert: vi.fn(),
  },
  Linking: {
    openURL: vi.fn(),
    canOpenURL: vi.fn().mockResolvedValue(true),
  },
}));

// Mock Expo modules
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    multiRemove: vi.fn().mockResolvedValue(undefined),
    getAllKeys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: vi.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: vi.fn().mockResolvedValue({ data: 'test-token' }),
  setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: vi.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: vi.fn().mockResolvedValue(undefined),
  getBadgeCountAsync: vi.fn().mockResolvedValue(0),
  setBadgeCountAsync: vi.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
  },
}));

vi.mock('expo-device', () => ({
  isDevice: true,
  deviceName: 'Test Device',
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: 'Link',
  Stack: {
    Screen: 'Screen',
  },
  Tabs: {
    Screen: 'Screen',
  },
}));

// Mock fetch
global.fetch = vi.fn();

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
