import * as nextEnvModule from '@next/env';

/**
 * `@next/env` is a bundled CommonJS module. Depending on the loader (native ESM,
 * tsx, Playwright's CJS transform, esbuild) its exports appear either on the
 * namespace or under `default`, so resolve both shapes in one place.
 */
type NextEnv = typeof import('@next/env');
const nextEnv = ((nextEnvModule as unknown as { default?: NextEnv }).default ??
  nextEnvModule) as NextEnv;

/** Load .env, .env.local, .env.[mode] files with the same precedence as Next.js. */
export function loadEnv(dev = process.env.NODE_ENV !== 'production'): void {
  nextEnv.loadEnvConfig(process.cwd(), dev);
}
