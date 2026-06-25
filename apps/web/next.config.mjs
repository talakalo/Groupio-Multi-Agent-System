import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// Derive allowed API origins from NEXT_PUBLIC_API_URL at runtime, so that
// docker-compose (which sets this to http://localhost:8000) works without
// needing NODE_ENV=development inside the container.
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const configuredWsUrl = configuredApiUrl
  .replace(/^https:/, "wss:")
  .replace(/^http:/, "ws:");
const extraOrigins = configuredApiUrl
  ? ` ${configuredApiUrl} ${configuredWsUrl}`
  : isDev
  ? " http://localhost:8000 ws://localhost:8000"
  : "";

const securityHeaders = [
  {
    // CSP — tighten 'unsafe-eval' and 'unsafe-inline' after full audit.
    // 'unsafe-eval' is currently required by Next.js in development;
    // it can be removed in production once no eval-dependent code remains.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self'",
      `connect-src 'self'${extraOrigins}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@groupio/types", "@groupio/api-client", "@groupio/utils"],

  webpack: (config) => {
    // Suppress Sentry/OpenTelemetry critical dependency warnings (require-in-the-middle, dynamic require)
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /require-in-the-middle/ },
      { module: /@opentelemetry\/instrumentation/, message: /Critical depend|request of a dependency/ },
    ];
    return config;
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  experimental: {
    // Suppress params/searchParams enumeration warning from dev tools (e.g. Cursor
    // element picker) that serialize React props — app code unwraps via use()/await.
    // internal_disableSyncDynamicAPIWarnings removed in Next.js 15.5 (flag no longer exists)
    optimizePackageImports: [
      "lucide-react",
      "recharts",          // used in admin charts; tree-shakes unused components
      "date-fns",          // locale-aware date formatting
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
