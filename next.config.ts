import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components: dynamic by default, opt into caching with 'use cache';
  // pages get a prerendered static shell with dynamic parts streamed in (PPR).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // forbidden() → 403 with app/forbidden.tsx, for organiser-only pages and actions.
    authInterrupts: true,
  },
  turbopack: {
    // Pin the workspace root to this project (ignore stray lockfiles in parent folders).
    root: process.cwd(),
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
