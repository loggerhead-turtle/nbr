/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared workspace packages ship TypeScript source; let Next transpile them.
  transpilePackages: ["@nbr/db", "@nbr/ratings", "@nbr/core"],
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
