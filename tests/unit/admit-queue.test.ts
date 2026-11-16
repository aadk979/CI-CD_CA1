import { describe, expect, it, vi } from 'vitest';
import type { AdmittedBatch } from '@/lib/waiting-room';
import { createAdmitQueueProcessor } from '@/server/jobs/admit-queue';

const batch = (eventId: string, admitted: string[]): AdmittedBatch => ({
  eventId,
  admitted,
  servedThrough: admitted.length,
  waiting: 0,
});

describe('createAdmitQueueProcessor', () => {
  it('admits the configured batch size with the configured pass lifetime', async () => {
    const admit = vi.fn().mockResolvedValue([]);
    const process = createAdmitQueueProcessor({ admit, batchSize: 25, passTtlMs: 900_000 });

    await process();

    expect(admit).toHaveBeenCalledWith({ batchSize: 25, passTtlMs: 900_000 });
  });

  it('reports each event that let fans in, e.g. to broadcast its new position', async () => {
    const batches = [batch('evt1', ['a', 'b']), batch('evt2', ['c'])];
    const onAdmitted = vi.fn();
    const process = createAdmitQueueProcessor({
      admit: vi.fn().mockResolvedValue(batches),
      batchSize: 2,
      passTtlMs: 1000,
      onAdmitted,
    });

    expect(await process()).toEqual(batches);
    expect(onAdmitted.mock.calls.map(([b]) => b)).toEqual(batches);
  });

  it('works without a callback, and passes Redis errors to BullMQ', async () => {
    const ok = createAdmitQueueProcessor({
      admit: vi.fn().mockResolvedValue([batch('evt1', ['a'])]),
      batchSize: 1,
      passTtlMs: 1000,
    });
    await expect(ok()).resolves.toHaveLength(1);

    const failing = createAdmitQueueProcessor({
      admit: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      batchSize: 1,
      passTtlMs: 1000,
    });
    await expect(failing()).rejects.toThrow('ECONNREFUSED');
  });
});
