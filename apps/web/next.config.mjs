import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// In development, allow the local backend (localhost:8000) so fetch/WebSocket
// calls are not blocked by CSP. In production, only the deployed API is allowed.
const devApiOrigins = isDev
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
      `connect-src 'self' https://api.groupio.co.il wss://api.groupio.co.il${devApiOrigins}`,
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
  transpilePackages: ["@groupio/types", "@groupio/api-client", "@groupio/utils"],

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
