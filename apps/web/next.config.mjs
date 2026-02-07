/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@groupio/types", "@groupio/api-client", "@groupio/utils"],

  i18n: {
    locales: ["he", "en"],
    defaultLocale: "he",
    localeDetection: true,
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
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
