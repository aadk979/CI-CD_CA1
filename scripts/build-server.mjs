// Bundles the custom server and worker entrypoints into dist/ for production.
// npm packages stay external (loaded from node_modules); our own src/ code and
// `@/` path aliases are resolved and bundled by esbuild.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts', 'worker.ts'],
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});
