import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { EventForm } from '@/components/organiser/event-form';
import { getPrisma } from '@/lib/db';
import { toDateTimeLocal } from '@/lib/event-form';
import { listVenues } from '@/lib/organiser';
import { requireOrganiser } from '@/server/organiser';

export const metadata: Metadata = { title: 'New event', robots: { index: false } };

async function NewEvent() {
  await requireOrganiser();
  const venues = await listVenues(getPrisma());

  if (venues.length === 0) {
    return <p className="text-zinc-500">Add a venue before creating events.</p>;
  }
  return <EventForm venues={venues} minStartsAt={toDateTimeLocal(new Date())} />;
}

export default function NewEventPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/organiser" className="text-sm text-zinc-500 hover:underline">
        ← All events
      </Link>
      <h1 className="mt-2 mb-8 text-3xl font-semibold tracking-tight">New event</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <NewEvent />
      </Suspense>
    </main>
  );
}
