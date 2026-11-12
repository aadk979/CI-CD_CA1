import { describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_KEY,
  HEARTBEAT_TTL_SECONDS,
  createHeartbeatProcessor,
} from '@/server/jobs/heartbeat';

describe('heartbeat processor', () => {
  it('stores the heartbeat with a TTL and broadcasts it', async () => {
    const redis = { set: vi.fn().mockResolvedValue('OK') };
    const emit = vi.fn();
    const now = () => new Date('2026-11-12T08:00:00.000Z');

    const result = await createHeartbeatProcessor({ redis, emit, now })();

    expect(result).toEqual({ at: '2026-11-12T08:00:00.000Z' });
    expect(redis.set).toHaveBeenCalledWith(
      HEARTBEAT_KEY,
      '2026-11-12T08:00:00.000Z',
      'EX',
      HEARTBEAT_TTL_SECONDS,
    );
    expect(emit).toHaveBeenCalledWith({ at: '2026-11-12T08:00:00.000Z' });
  });

  it('does not broadcast if Redis write fails (job will be retried)', async () => {
    const redis = { set: vi.fn().mockRejectedValue(new Error('READONLY')) };
    const emit = vi.fn();

    await expect(createHeartbeatProcessor({ redis, emit })()).rejects.toThrow('READONLY');
    expect(emit).not.toHaveBeenCalled();
  });
});
