// ---- Color Tokens ----

export const colors = {
  primary: "#1a9a76",
  primaryLight: "#3fb08f",
  primaryDark: "#147a5e",

  accent: "#f59e0b",
  accentLight: "#fbbf24",
  accentDark: "#d97706",

  success: "#22c55e",
  successLight: "#4ade80",
  successDark: "#16a34a",

  warning: "#f59e0b",
  warningLight: "#fbbf24",
  warningDark: "#d97706",

  error: "#ef4444",
  errorLight: "#f87171",
  errorDark: "#dc2626",

  info: "#3b82f6",
  infoLight: "#60a5fa",
  infoDark: "#2563eb",

  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
    950: "#030712",
  },

  white: "#ffffff",
  black: "#000000",

  background: {
    primary: "#ffffff",
    secondary: "#f9fafb",
    tertiary: "#f3f4f6",
  },

  text: {
    primary: "#111827",
    secondary: "#4b5563",
    tertiary: "#9ca3af",
    inverse: "#ffffff",
  },

  border: {
    light: "#e5e7eb",
    medium: "#d1d5db",
    dark: "#9ca3af",
  },
} as const;

// ---- Typography Tokens ----

export const fontFamilies = {
  sans: "'Heebo', 'Inter', sans-serif",
  heading: "'Heebo', 'Inter', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

export const fontSizes = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeights = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
} as const;

export const letterSpacings = {
  tighter: "-0.05em",
  tight: "-0.025em",
  normal: "0em",
  wide: "0.025em",
  wider: "0.05em",
} as const;

// ---- Spacing Scale ----

export const spacing = {
  px: "1px",
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  3.5: "0.875rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  7: "1.75rem",
  8: "2rem",
  9: "2.25rem",
  10: "2.5rem",
  12: "3rem",
  14: "3.5rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  28: "7rem",
  32: "8rem",
  36: "9rem",
  40: "10rem",
  48: "12rem",
  56: "14rem",
  64: "16rem",
} as const;

// ---- Border Radius ----

export const radii = {
  none: "0",
  sm: "4px",
  base: "6px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  "3xl": "1.5rem",
  full: "9999px",
} as const;

// ---- Shadows ----

export const shadows = {
  none: "none",
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  base: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
} as const;

// ---- Breakpoints ----

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// ---- Transitions ----

export const transitions = {
  fast: "150ms ease-in-out",
  base: "200ms ease-in-out",
  slow: "300ms ease-in-out",
  spring: "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// ---- Z-Index Scale ----

export const zIndices = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  toast: 1700,
  tooltip: 1800,
} as const;

// ---- Composite Theme Object ----

export const tokens = {
  colors,
  fontFamilies,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  spacing,
  radii,
  shadows,
  breakpoints,
  transitions,
  zIndices,
} as const;

export type DesignTokens = typeof tokens;
