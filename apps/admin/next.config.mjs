/** @type {import('next').NextConfig} */
const nextConfig = {
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
