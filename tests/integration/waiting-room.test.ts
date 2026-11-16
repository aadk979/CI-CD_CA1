import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createRedis } from '@/lib/redis';
import {
  ACTIVE_QUEUES_KEY,
  admitFromAllQueues,
  admitNext,
  getAccessPass,
  getQueueStats,
  getQueueStatus,
  joinQueue,
  passKey,
} from '@/lib/waiting-room';

/** Real Redis: the Lua scripts and their atomicity are exactly what's under test. */
const redis = createRedis();
const used: string[] = [];
const PASS = 60_000;

/** A fresh event id per test, so tests never see each other's queues. */
function newEvent(): string {
  const id = `evt-${randomUUID().slice(0, 8)}`;
  used.push(id);
  return id;
}

afterEach(async () => {
  for (const id of used.splice(0)) {
    const keys = await redis.keys(`waitroom:{${id}}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.srem(ACTIVE_QUEUES_KEY, id);
  }
});

afterAll(async () => {
  await redis.quit();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('joining the queue (SCRUM-34)', () => {
  it('serves fans first-come-first-served: tickets follow arrival order', async () => {
    const evt = newEvent();

    const ada = await joinQueue(redis, evt, 'ada');
    const bo = await joinQueue(redis, evt, 'bo');
    const cy = await joinQueue(redis, evt, 'cy');

    expect([ada, bo, cy].map((s) => s.state === 'queued' && s.ticket)).toEqual([1, 2, 3]);
    expect(cy).toMatchObject({ state: 'queued', position: 3, servedThrough: 0, waiting: 3 });
  });

  it('refreshing (joining again) keeps your place instead of sending you to the back', async () => {
    const evt = newEvent();
    await joinQueue(redis, evt, 'ada');
    await joinQueue(redis, evt, 'bo');

    const again = await joinQueue(redis, evt, 'ada');

    expect(again).toMatchObject({ state: 'queued', ticket: 1, position: 1, waiting: 2 });
    expect(await getQueueStatus(redis, evt, 'ada')).toMatchObject({ state: 'queued', ticket: 1 });
  });

  it('gives 50 simultaneous fans 50 distinct tickets, with no gaps', async () => {
    const evt = newEvent();
    const fans = Array.from({ length: 50 }, (_, i) => `fan-${i}`);

    const results = await Promise.all(fans.map((f) => joinQueue(redis, evt, f)));

    const tickets = results
      .map((r) => (r.state === 'queued' ? r.ticket : -1))
      .sort((a, b) => a - b);
    expect(tickets).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('registers the event as having a live queue, for the worker to serve', async () => {
    const evt = newEvent();
    expect(await redis.sismember(ACTIVE_QUEUES_KEY, evt)).toBe(0);

    await joinQueue(redis, evt, 'ada');

    expect(await redis.sismember(ACTIVE_QUEUES_KEY, evt)).toBe(1);
  });

  it('reports a fan who has not joined as not queued, with the queue size', async () => {
    const evt = newEvent();
    await joinQueue(redis, evt, 'ada');

    expect(await getQueueStatus(redis, evt, 'bo')).toEqual({
      state: 'not-queued',
      eventId: evt,
      servedThrough: 0,
      waiting: 1,
    });
  });
});

describe('admitting fans in batches (SCRUM-35)', () => {
  it('admits exactly N fans per tick, lowest tickets first', async () => {
    const evt = newEvent();
    for (const f of ['ada', 'bo', 'cy', 'di', 'ed']) await joinQueue(redis, evt, f);

    const first = await admitNext(redis, evt, { batchSize: 2, passTtlMs: PASS });
    const second = await admitNext(redis, evt, { batchSize: 2, passTtlMs: PASS });

    expect(first).toEqual({ eventId: evt, admitted: ['ada', 'bo'], servedThrough: 2, waiting: 3 });
    expect(second).toEqual({ eventId: evt, admitted: ['cy', 'di'], servedThrough: 4, waiting: 1 });
    // Positions of those still waiting move up accordingly.
    expect(await getQueueStatus(redis, evt, 'ed')).toMatchObject({ position: 1, ticket: 5 });
  });

  it('gives each admitted fan their own random, time-limited access token', async () => {
    const evt = newEvent();
    await joinQueue(redis, evt, 'ada');
    await joinQueue(redis, evt, 'bo');

    await admitNext(redis, evt, { batchSize: 2, passTtlMs: PASS });

    const [ada, bo] = await Promise.all([
      redis.get(passKey(evt, 'ada')),
      redis.get(passKey(evt, 'bo')),
    ]);
    expect(ada).toMatch(/^[\w-]{32}$/); // 24 random bytes, base64url
    expect(bo).toMatch(/^[\w-]{32}$/);
    expect(ada).not.toBe(bo);
    const ttl = await redis.pttl(passKey(evt, 'ada'));
    expect(ttl).toBeGreaterThan(PASS - 5_000);
    expect(ttl).toBeLessThanOrEqual(PASS);
  });

  it('an admitted fan is told so, and joining again does not re-queue them', async () => {
    const evt = newEvent();
    const now = new Date();
    await joinQueue(redis, evt, 'ada');
    await admitNext(redis, evt, { batchSize: 1, passTtlMs: PASS });

    const status = await getQueueStatus(redis, evt, 'ada', now);
    const rejoin = await joinQueue(redis, evt, 'ada', now);

    expect(status.state).toBe('admitted');
    expect(rejoin.state).toBe('admitted');
    expect(await getQueueStats(redis, evt)).toEqual({ eventId: evt, servedThrough: 1, waiting: 0 });
    const expires = await getAccessPass(redis, evt, 'ada', now);
    expect(expires!.getTime() - now.getTime()).toBeGreaterThan(PASS - 5_000);
  });

  it('once the pass lapses, access ends and rejoining goes to the back of the line', async () => {
    const evt = newEvent();
    await joinQueue(redis, evt, 'ada');
    await admitNext(redis, evt, { batchSize: 1, passTtlMs: 150 });
    await joinQueue(redis, evt, 'bo'); // ticket 2, waiting behind nobody

    await sleep(250);

    expect(await getAccessPass(redis, evt, 'ada')).toBeNull();
    expect(await joinQueue(redis, evt, 'ada')).toMatchObject({
      state: 'queued',
      ticket: 3,
      position: 2,
    });
  });

  it('stops serving an event once its queue is empty, and never admits from an empty queue', async () => {
    const evt = newEvent();
    await joinQueue(redis, evt, 'ada');

    await admitNext(redis, evt, { batchSize: 10, passTtlMs: PASS });
    const empty = await admitNext(redis, evt, { batchSize: 10, passTtlMs: PASS });

    expect(empty).toEqual({ eventId: evt, admitted: [], servedThrough: 1, waiting: 0 });
    expect(await redis.sismember(ACTIVE_QUEUES_KEY, evt)).toBe(0);
  });

  it('one worker tick serves every event with a queue, independently', async () => {
    const [a, b] = [newEvent(), newEvent()];
    for (const f of ['a1', 'a2', 'a3']) await joinQueue(redis, a, f);
    await joinQueue(redis, b, 'b1');

    const batches = await admitFromAllQueues(redis, { batchSize: 2, passTtlMs: PASS });

    // Other test runs may share this Redis: only look at our two events.
    const ours = batches.filter((x) => x.eventId === a || x.eventId === b);
    expect(ours.find((x) => x.eventId === a)?.admitted).toEqual(['a1', 'a2']);
    expect(ours.find((x) => x.eventId === b)?.admitted).toEqual(['b1']);
    expect(await getQueueStatus(redis, a, 'a3')).toMatchObject({ position: 1 });
  });
});
