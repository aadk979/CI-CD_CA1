import type { HeartbeatPayload } from '@/lib/realtime';

export const HEARTBEAT_KEY = 'worker:heartbeat';
export const HEARTBEAT_INTERVAL_MS = 10_000;
/** If no heartbeat lands within this window, the worker is considered down. */
export const HEARTBEAT_TTL_SECONDS = 30;

export interface HeartbeatDeps {
  redis: { set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown> };
  emit: (payload: HeartbeatPayload) => void;
  now?: () => Date;
}

/**
 * Records that the worker is alive (read by /api/health) and pushes the
 * heartbeat to connected browsers over Socket.IO.
 */
export function createHeartbeatProcessor({ redis, emit, now = () => new Date() }: HeartbeatDeps) {
  return async (): Promise<HeartbeatPayload> => {
    const payload: HeartbeatPayload = { at: now().toISOString() };
    await redis.set(HEARTBEAT_KEY, payload.at, 'EX', HEARTBEAT_TTL_SECONDS);
    emit(payload);
    return payload;
  };
}
