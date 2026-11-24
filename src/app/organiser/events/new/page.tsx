import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventForm } from '@/components/organiser/event-form';
import { BackLink, PageHeading, PageShell } from '@/components/ui/page';
import { card } from '@/components/ui/styles';
import { getPrisma } from '@/lib/db';
import { toDateTimeLocal } from '@/lib/event-form';
import { listVenues } from '@/lib/organiser';
import { requireOrganiser } from '@/server/organiser';

export const metadata: Metadata = { title: 'New event', robots: { index: false } };

async function NewEvent() {
  await requireOrganiser();
  const venues = await listVenues(getPrisma());

  if (venues.length === 0) {
    return <p className="text-body">Add a venue before creating events.</p>;
  }
  return <EventForm venues={venues} minStartsAt={toDateTimeLocal(new Date())} />;
}

export default function NewEventPage() {
  return (
    <PageShell width="narrow">
      <BackLink href="/organiser">All events</BackLink>
      <div className="mt-6">
        <PageHeading
          eyebrow="Organiser"
          title="New event"
          lead="Saved as a draft first, so you can preview the seat map before fans see it."
        />
      </div>
      <div className={`${card} p-6 md:p-8`}>
        <Suspense fallback={<div className="skeleton h-96 w-full" aria-busy />}>
          <NewEvent />
        </Suspense>
      </div>
    </PageShell>
  );
}
