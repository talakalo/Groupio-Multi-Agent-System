import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f9f6",
          100: "#d1f0e6",
          200: "#a3e1cd",
          300: "#6ec9ad",
          400: "#3fb08f",
          500: "#1a9a76",
          600: "#147a5e",
          700: "#105f49",
          800: "#0d4938",
          900: "#0a3329",
          950: "#061f19",
        },
        accent: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        info: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        surface: {
          white: "#ffffff",
          page: "#f7f8f6",
          subtle: "#f0f2ef",
          muted: "#e4e8e3",
        },
        // Deep brand dark — used for sidebar + dark surfaces
        brand: {
          50: "#eef6f1",
          100: "#d2e8db",
          200: "#a8d2bc",
          300: "#73b698",
          400: "#3f9473",
          500: "#1a9a76",
          600: "#0f5e42",
          700: "#0c4a33",
          800: "#093826",
          900: "#072d1e",
          950: "#041a12",
        },
      },
      fontFamily: {
        heebo: ["var(--font-heebo)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-lg": ["2.25rem", { lineHeight: "1.15", fontWeight: "800", letterSpacing: "-0.025em" }],
        "display-sm": ["1.875rem", { lineHeight: "1.2", fontWeight: "800", letterSpacing: "-0.02em" }],
        "heading-lg": ["1.5rem", { lineHeight: "1.3", fontWeight: "700", letterSpacing: "-0.018em" }],
        "heading-md": ["1.25rem", { lineHeight: "1.35", fontWeight: "700", letterSpacing: "-0.015em" }],
        "heading-sm": ["1.125rem", { lineHeight: "1.4", fontWeight: "600", letterSpacing: "-0.01em" }],
        "body-lg": ["1rem", { lineHeight: "1.65", fontWeight: "400" }],
        "body-md": ["0.875rem", { lineHeight: "1.55", fontWeight: "400" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["0.875rem", { lineHeight: "1.4", fontWeight: "500" }],
        caption: ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
        overline: ["0.6875rem", { lineHeight: "1.5", fontWeight: "600", letterSpacing: "0.06em" }],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgba(10, 51, 41, 0.06)",
        sm: "0 1px 3px 0 rgba(10, 51, 41, 0.08), 0 1px 2px -1px rgba(10, 51, 41, 0.06)",
        md: "0 4px 8px -1px rgba(10, 51, 41, 0.09), 0 2px 6px -2px rgba(10, 51, 41, 0.06)",
        lg: "0 10px 20px -3px rgba(10, 51, 41, 0.1), 0 4px 10px -4px rgba(10, 51, 41, 0.07)",
        xl: "0 20px 32px -5px rgba(10, 51, 41, 0.12), 0 8px 16px -6px rgba(10, 51, 41, 0.08)",
        // Colored brand shadow for elevated elements
        brand: "0 4px 16px -2px rgba(26, 154, 118, 0.2), 0 2px 8px -2px rgba(26, 154, 118, 0.12)",
        "brand-lg": "0 8px 32px -4px rgba(26, 154, 118, 0.25), 0 4px 16px -4px rgba(26, 154, 118, 0.15)",
        // Inner shadow for inputs
        inner: "inset 0 2px 4px 0 rgba(10, 51, 41, 0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #1a9a76 0%, #105f49 100%)",
        "gradient-primary-soft": "linear-gradient(135deg, #f0f9f6 0%, #d1f0e6 100%)",
        "gradient-accent": "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        "gradient-brand": "linear-gradient(160deg, #093826 0%, #0c4a33 50%, #0f5e42 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
