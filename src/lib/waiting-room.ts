import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';

/**
 * Virtual waiting room (SCRUM-34/35/36). Framework-free: Server Actions, the Socket.IO
 * server and the BullMQ worker wrap these, and the integration tests run them against
 * a real Redis.
 *
 * Each event has its own first-come-first-served queue in Redis:
 *   - every fan who joins gets the next ticket number (1, 2, 3, …), stored as the score
 *     of their user id in a sorted set. Joining again returns the same ticket, so
 *     refreshing the page never loses your place;
 *   - the worker admits the lowest tickets in batches. Each admitted fan gets an access
 *     pass: a random token that expires after a fixed time, which lets them pick seats;
 *   - `servedThrough` is the highest ticket admitted so far, so a fan's position is
 *     simply `ticket - servedThrough`. Browsers compute it from one broadcast number
 *     instead of the server sending every fan their own update.
 *
 * Joining and admitting run as Lua scripts, which Redis executes atomically: two fans
 * joining at the same instant can never get the same ticket, tickets have no gaps, and
 * nobody is admitted twice.
 */

/** Set of every event that has fans waiting, so the worker knows which queues to serve. */
export const ACTIVE_QUEUES_KEY = 'waitroom:active';

/** Braces are a Redis hash tag: all of one event's keys land on the same node in a cluster. */
export const queueKeys = (eventId: string) => ({
  queue: `waitroom:{${eventId}}:queue`,
  seq: `waitroom:{${eventId}}:seq`,
  served: `waitroom:{${eventId}}:served`,
  passPrefix: `waitroom:{${eventId}}:pass:`,
});

export const passKey = (eventId: string, userId: string) =>
  `${queueKeys(eventId).passPrefix}${userId}`;

export interface QueueStats {
  eventId: string;
  /** Highest ticket admitted so far (0 before anyone is admitted). */
  servedThrough: number;
  /** Fans still waiting. */
  waiting: number;
}

export type QueueStatus =
  | ({ state: 'admitted'; passExpiresAt: Date } & QueueStats)
  | ({ state: 'queued'; ticket: number; position: number } & QueueStats)
  | ({ state: 'not-queued' } & QueueStats);

export interface AdmittedBatch extends QueueStats {
  /** User ids admitted in this batch, in queue order. */
  admitted: string[];
}

// KEYS: queue, seq, pass, active, served · ARGV: userId, eventId
const JOIN_SCRIPT = `
local ttl = redis.call('PTTL', KEYS[3])
local served = tonumber(redis.call('GET', KEYS[5]) or '0')
if ttl > 0 then
  return {'admitted', ttl, served, redis.call('ZCARD', KEYS[1])}
end
local ticket = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not ticket then
  ticket = redis.call('INCR', KEYS[2])
  redis.call('ZADD', KEYS[1], ticket, ARGV[1])
  redis.call('SADD', KEYS[4], ARGV[2])
end
return {'queued', tonumber(ticket), served, redis.call('ZCARD', KEYS[1])}
`;

// KEYS: queue, served, active · ARGV: eventId, batchSize, passTtlMs, passPrefix, token1..tokenN
// Pass keys are derived from the popped user ids, so they can't be declared up front;
// they share the event's hash tag, so this still works on a cluster.
const ADMIT_SCRIPT = `
local popped = redis.call('ZPOPMIN', KEYS[1], ARGV[2])
local admitted = {}
for i = 1, #popped, 2 do
  local n = (i + 1) / 2
  redis.call('SET', ARGV[4] .. popped[i], ARGV[4 + n], 'PX', ARGV[3])
  redis.call('SET', KEYS[2], popped[i + 1])
  admitted[n] = popped[i]
end
local waiting = redis.call('ZCARD', KEYS[1])
if waiting == 0 then redis.call('SREM', KEYS[3], ARGV[1]) end
return {tonumber(redis.call('GET', KEYS[2]) or '0'), waiting, admitted}
`;

const newToken = () => randomBytes(24).toString('base64url');

/**
 * Join an event's queue. Idempotent: a fan already in the queue keeps their ticket, and a
 * fan who has already been admitted (and whose pass is still valid) is told so instead.
 */
export async function joinQueue(
  redis: Redis,
  eventId: string,
  userId: string,
  now: Date = new Date(),
): Promise<QueueStatus> {
  const k = queueKeys(eventId);
  const [state, value, servedThrough, waiting] = (await redis.eval(
    JOIN_SCRIPT,
    5,
    k.queue,
    k.seq,
    passKey(eventId, userId),
    ACTIVE_QUEUES_KEY,
    k.served,
    userId,
    eventId,
  )) as [string, number, number, number];

  const stats = { eventId, servedThrough, waiting };
  if (state === 'admitted') {
    return { state, passExpiresAt: new Date(now.getTime() + value), ...stats };
  }
  return { state: 'queued', ticket: value, position: value - servedThrough, ...stats };
}

/** Where a fan stands, without joining. */
export async function getQueueStatus(
  redis: Redis,
  eventId: string,
  userId: string,
  now: Date = new Date(),
): Promise<QueueStatus> {
  const k = queueKeys(eventId);
  const results = await redis
    .multi()
    .pttl(passKey(eventId, userId))
    .zscore(k.queue, userId)
    .get(k.served)
    .zcard(k.queue)
    .exec();
  const [ttl, ticket, served, waiting] = (results ?? []).map(([err, value]) => {
    if (err) throw err;
    return value;
  }) as [number, string | null, string | null, number];

  const stats = { eventId, servedThrough: Number(served ?? 0), waiting };
  if (ttl > 0) return { state: 'admitted', passExpiresAt: new Date(now.getTime() + ttl), ...stats };
  if (ticket !== null) {
    const t = Number(ticket);
    return { state: 'queued', ticket: t, position: t - stats.servedThrough, ...stats };
  }
  return { state: 'not-queued', ...stats };
}

/** Queue-wide numbers every waiting fan needs to work out their own position. */
export async function getQueueStats(redis: Redis, eventId: string): Promise<QueueStats> {
  const k = queueKeys(eventId);
  const [served, waiting] = await Promise.all([redis.get(k.served), redis.zcard(k.queue)]);
  return { eventId, servedThrough: Number(served ?? 0), waiting };
}

/** When this fan's access pass lapses, or null if they have none. */
export async function getAccessPass(
  redis: Redis,
  eventId: string,
  userId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const ttl = await redis.pttl(passKey(eventId, userId));
  return ttl > 0 ? new Date(now.getTime() + ttl) : null;
}

/** Admit the next `batchSize` fans of one event, giving each a pass valid for `passTtlMs`. */
export async function admitNext(
  redis: Redis,
  eventId: string,
  { batchSize, passTtlMs }: { batchSize: number; passTtlMs: number },
): Promise<AdmittedBatch> {
  const k = queueKeys(eventId);
  const tokens = Array.from({ length: batchSize }, newToken);
  const [servedThrough, waiting, admitted] = (await redis.eval(
    ADMIT_SCRIPT,
    3,
    k.queue,
    k.served,
    ACTIVE_QUEUES_KEY,
    eventId,
    batchSize,
    passTtlMs,
    k.passPrefix,
    ...tokens,
  )) as [number, number, string[]];
  return { eventId, servedThrough, waiting, admitted };
}

/** One worker tick: admit the next batch from every event that has fans waiting. */
export async function admitFromAllQueues(
  redis: Redis,
  options: { batchSize: number; passTtlMs: number },
): Promise<AdmittedBatch[]> {
  const eventIds = await redis.smembers(ACTIVE_QUEUES_KEY);
  const batches = await Promise.all(eventIds.map((id) => admitNext(redis, id, options)));
  return batches.filter((b) => b.admitted.length > 0);
}
