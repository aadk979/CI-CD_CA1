import type { Redis } from 'ioredis';
import type { PrismaClient } from '@/generated/prisma/client';
import { hasActiveHold } from './holds';
import { getAccessPass } from './waiting-room';

/**
 * Who may pick seats for an event. Ordinary events are open to everyone. For waiting-room
 * events a fan needs a valid access pass from the queue, or seats already in their cart
 * (so a pass lapsing mid-checkout never strands a fan who is holding seats).
 */
export type ShopAccess =
  | { allowed: true; via: 'open' }
  | { allowed: true; via: 'pass'; passExpiresAt: Date }
  | { allowed: true; via: 'cart' }
  | { allowed: false };

export interface AccessDeps {
  prisma: PrismaClient;
  redis: Redis;
}

export async function getShopAccess(
  { prisma, redis }: AccessDeps,
  {
    event,
    userId,
    now = new Date(),
  }: { event: { id: string; waitingRoom: boolean }; userId?: string; now?: Date },
): Promise<ShopAccess> {
  if (!event.waitingRoom) return { allowed: true, via: 'open' };
  if (!userId) return { allowed: false };

  const passExpiresAt = await getAccessPass(redis, event.id, userId, now);
  if (passExpiresAt) return { allowed: true, via: 'pass', passExpiresAt };

  if (await hasActiveHold(prisma, { eventId: event.id, userId, now })) {
    return { allowed: true, via: 'cart' };
  }
  return { allowed: false };
}

/** Same check by event id, for Server Actions that only receive the id from a form. */
export async function getShopAccessById(
  deps: AccessDeps,
  { eventId, userId, now }: { eventId: string; userId: string; now?: Date },
): Promise<ShopAccess> {
  const event = await deps.prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, waitingRoom: true },
  });
  // An unknown event is reported by the hold itself ("This event does not exist").
  if (!event) return { allowed: true, via: 'open' };
  return getShopAccess(deps, { event, userId, now });
}
