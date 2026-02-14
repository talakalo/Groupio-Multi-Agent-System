/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { afterEach, vi } from 'vitest';

// Mock @testing-library/react-native (it fails to load RN host components in Node)
vi.mock('@testing-library/react-native', () => {
  const { create, act } = require('react-test-renderer');

  type TestNode = { children?: TestNode[]; props?: Record<string, unknown> };

  /** Collect all text strings from a test-instance subtree. */
  const collectText = (instance: unknown): string => {
    if (typeof instance === 'string' || typeof instance === 'number') return String(instance);
    if (!instance || typeof instance !== 'object') return '';
    const node = instance as TestNode;
    if (node.children) return node.children.map(collectText).join('');
    return '';
  };

  /** Walk all instances depth-first. */
  const walkAll = (instance: unknown, cb: (node: TestNode) => void) => {
    if (!instance || typeof instance !== 'object') return;
    cb(instance as TestNode);
    const node = instance as TestNode;
    if (node.children) for (const child of node.children) walkAll(child, cb);
  };

  const render = (element: React.ReactElement) => {
    let renderer: { root: TestNode; unmount: () => void };
    act(() => {
      renderer = create(element) as { root: TestNode; unmount: () => void };
    });
    const rootInstance = renderer.root;

    const getByText = (match: string | RegExp) => {
      const nodes: TestNode[] = [];
      walkAll(rootInstance, (node) => {
        if (typeof node === 'string' || typeof node === 'number') return;
        const text = collectText(node);
        if (text && (typeof match === 'string' ? text.includes(match) : match.test(text))) {
          nodes.push(node as TestNode);
        }
      });
      if (!nodes.length) throw new Error(`Unable to find text: ${match}`);
      return { props: (nodes[nodes.length - 1] as TestNode).props ?? {} };
    };

    const queryByText = (match: string | RegExp) => {
      try { return getByText(match); } catch { return null; }
    };

    const getByTestId = (id: string) => {
      try {
        return rootInstance.findByProps({ testID: id });
      } catch {
        throw new Error(`Unable to find testID: ${id}`);
      }
    };

    const getByLabelText = (match: string | RegExp) => {
      const nodes: TestNode[] = [];
      walkAll(rootInstance, (node) => {
        const label = String(node.props?.accessibilityLabel ?? node.props?.['aria-label'] ?? '');
        if (label && (typeof match === 'string' ? label.includes(match) : match.test(label))) {
          nodes.push(node);
        }
      });
      if (!nodes.length) throw new Error(`Unable to find accessibilityLabel: ${match}`);
      return { props: nodes[0].props };
    };

    const getByRole = (role: string) => {
      const nodes: TestNode[] = [];
      walkAll(rootInstance, (node) => {
        if (node.props?.accessibilityRole === role || node.props?.role === role) {
          nodes.push(node);
        }
      });
      if (!nodes.length) throw new Error(`Unable to find role: ${role}`);
      return { props: nodes[0].props };
    };

    return {
      getByText,
      queryByText,
      getByTestId,
      getByLabelText,
      getByRole,
      unmount: () => renderer.unmount(),
    };
  };

  const fireEvent = {
    press: (node: { props?: { onPress?: () => void } }) => {
      if (node.props?.onPress) node.props.onPress();
    },
    changeText: (node: { props?: { onChangeText?: (t: string) => void } }, text: string) => {
      if (node.props?.onChangeText) node.props.onChangeText(text);
    },
  };

  return { render, fireEvent };
});

// Mock react-native-paper (tokens/themes fail to load in Node)
vi.mock('react-native-paper', () => {
  const { createElement } = require('react');
  const wrap = (name: string) => {
    const Comp = (props: Record<string, unknown>) => createElement(name, props, props.children);
    Comp.displayName = name;
    return Comp;
  };
  const MockCard = Object.assign(wrap('Card'), {
    Content: wrap('CardContent'),
    Title: wrap('CardTitle'),
    Cover: wrap('CardCover'),
    Actions: wrap('CardActions'),
  });
  const MockAvatar = {
    Icon: wrap('AvatarIcon'),
    Image: wrap('AvatarImage'),
    Text: wrap('AvatarText'),
  };
  return {
    Card: MockCard,
    Text: wrap('Text'),
    Button: wrap('Button'),
    Chip: wrap('Chip'),
    Avatar: MockAvatar,
    ProgressBar: wrap('ProgressBar'),
    useTheme: () => ({
      colors: {
        primary: '#6200ee',
        secondary: '#03DAC6',
        background: '#ffffff',
        surface: '#ffffff',
        surfaceVariant: '#f5f5f5',
        error: '#B00020',
        text: '#000000',
        onSurface: '#000000',
        onBackground: '#000000',
        onPrimary: '#ffffff',
        outline: '#cccccc',
        elevation: { level0: '#fff', level1: '#fff', level2: '#fff', level3: '#fff' },
      },
      dark: false,
    }),
    Provider: wrap('PaperProvider'),
    DefaultTheme: { colors: {} },
    MD3LightTheme: { colors: {} },
  };
});

// Mock react-native-vector-icons
vi.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const { createElement } = require('react');
  const Icon = (props: Record<string, unknown>) => createElement('Icon', props);
  Icon.displayName = 'Icon';
  return { default: Icon };
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
