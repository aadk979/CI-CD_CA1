'use server';

import 'server-only';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { getPrisma } from '@/lib/db';
import { isOnSale } from '@/lib/events';
import { getRedis } from '@/lib/redis';
import { joinQueue } from '@/lib/waiting-room';
import { broadcastQueue, getEmitter } from '@/server/broadcast';
import { getCurrentUser } from '@/server/session';

const SLUG_PATTERN = /^[a-z0-9-]{1,100}$/;

/**
 * Join an event's waiting room (SCRUM-34). Identity comes from the session cookie, so a
 * fan holds exactly one place per event however many times they submit or refresh.
 * A plain <form> action: it works before JavaScript loads, too.
 */
export async function joinQueueAction(formData: FormData): Promise<void> {
  const slug = formData.get('slug');
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) redirect('/');

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const event = await getPrisma().event.findUnique({
    where: { slug },
    select: { id: true, waitingRoom: true, status: true, startsAt: true },
  });
  if (!event) redirect('/');
  // No queue to join: the event page explains why (not on sale, or open to everyone).
  if (!event.waitingRoom || !isOnSale(event)) redirect(`/events/${slug}`);

  const status = await joinQueue(getRedis(), event.id, user.id);
  if (status.state === 'admitted') redirect(`/events/${slug}`);

  try {
    // The queue grew: update the "fans waiting" count for everyone already in it.
    broadcastQueue(getEmitter(), status);
  } catch (err) {
    console.error('Could not broadcast queue update', err); // best-effort, like seat updates
  }
  refresh(); // re-render the queue page with this fan's place in line
}
