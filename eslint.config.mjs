import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off stylistic rules that conflict with Prettier (Prettier owns formatting).
  prettier,
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'reports/**',
    'playwright-report/**',
    'test-results/**',
    'src/generated/**',
    'docs/**',
    'next-env.d.ts',
  ]),
]);
