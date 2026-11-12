import { Redis, type RedisOptions } from 'ioredis';
import { getEnv } from './env';

/**
 * Create a new Redis connection.
 * BullMQ workers and the Socket.IO adapter each need their own dedicated connections
 * (blocking commands / pub-sub), so this is a factory rather than a singleton.
 */
export function createRedis(options: RedisOptions = {}): Redis {
  return new Redis(getEnv().REDIS_URL, {
    // Required by BullMQ for blocking connections; harmless elsewhere.
    maxRetriesPerRequest: null,
    ...options,
  });
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

/** Shared connection for simple commands (health checks, caching). */
export function getRedis(): Redis {
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}
