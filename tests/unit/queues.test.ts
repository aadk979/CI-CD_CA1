import { describe, expect, it } from 'vitest';
import { QUEUE_NAMES, createQueue } from '@/server/queues';

describe('createQueue', () => {
  it('applies retry and retention defaults to every job', async () => {
    // lazyConnect: build the queue without touching Redis.
    const queue = createQueue(QUEUE_NAMES.system, { host: 'localhost', lazyConnect: true });
    expect(queue.name).toBe('system');
    expect(queue.defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    await queue.close();
  });
});
