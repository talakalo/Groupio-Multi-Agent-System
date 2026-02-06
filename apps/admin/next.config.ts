import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@groupio/types",
    "@groupio/api-client",
    "@groupio/utils",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
