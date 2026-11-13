import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate environment variables. Parsed lazily (not at import time) so that
 * `next build` can import modules without a database or Redis configured.
 */
export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/**
 * Auth settings are validated separately so processes that never authenticate
 * anyone (the BullMQ worker) don't need the signing secret.
 */
const authEnvSchema = z.object({
  /** Signs session cookies. Generate with: openssl rand -base64 32 */
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  /**
   * Public URL of the app. An https:// URL makes session cookies `Secure`;
   * plain http:// is only acceptable for local development and tests.
   */
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/, error: 'BETTER_AUTH_URL must be an http(s) URL' }),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;

export function parseAuthEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid auth configuration — ${issues}`);
  }
  return result.data;
}

let cachedAuth: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cachedAuth ??= parseAuthEnv(process.env);
  return cachedAuth;
}
