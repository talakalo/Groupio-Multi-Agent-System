/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@groupio/types", "@groupio/api-client", "@groupio/utils"],

  // Note: i18n config removed - not supported with App Router
  // For i18n in App Router, use [locale] dynamic segments or next-intl

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
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
