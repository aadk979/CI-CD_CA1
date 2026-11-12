import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cache Components: dynamic by default, opt into caching with 'use cache';
  // pages get a prerendered static shell with dynamic parts streamed in (PPR).
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
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
