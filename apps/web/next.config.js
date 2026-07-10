/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@german-smart-apply/shared', '@german-smart-apply/ai'],
  eslint: {
    // Linting is run separately via `pnpm --filter web lint` (flat ESLint config at repo root).
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
