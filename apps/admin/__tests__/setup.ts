import '@testing-library/jest-dom';
import React from 'react';
import { vi, afterEach } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js image
vi.mock('next/image', () => ({
  default: function MockImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    // This test mock intentionally renders a plain img element.
    return React.createElement('img', { ...props, alt: props.alt || '' });
  },
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
} as unknown as typeof IntersectionObserver;

// Mock fetch
global.fetch = vi.fn();

// Prevent jsdom "Not implemented: navigation" from CSV download anchor clicks.
// When handleExportCSV creates an <a href="blob:..."> and calls a.click(), jsdom
// throws "Not implemented: navigation (except hash changes)". Mocking the prototype
// stops jsdom from attempting the navigation while createObjectURL calls still work.
HTMLAnchorElement.prototype.click = vi.fn();

// Suppress jsdom "Not implemented: navigation (except hash changes)" errors.
// jsdom throws this when anything triggers window.location navigation (e.g.
// Next.js router internals that bypass the vi.mock). Replace assign/replace/reload
// with no-ops so tests don't produce spurious error output.
const _originalLocation = window.location;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (window as any).location;
Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: {
    ..._originalLocation,
    href: 'http://localhost/',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'http://localhost',
    assign: vi.fn(),
    replace: vi.fn(),
    reload: vi.fn(),
  },
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
