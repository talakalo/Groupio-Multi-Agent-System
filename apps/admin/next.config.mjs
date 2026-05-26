import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// In development, allow the local backend so fetch calls are not blocked by CSP.
const devApiOrigins = isDev
  ? " http://localhost:8000 ws://localhost:8000"
  : "";

const adminSecurityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
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
  output: "standalone",
  transpilePackages: [
    "@groupio/types",
    "@groupio/api-client",
    "@groupio/utils",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /require-in-the-middle/ },
      {
        module: /@opentelemetry\/instrumentation/,
        message: /Critical depend|request of a dependency/,
      },
    ];
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: adminSecurityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
