'use client';

import { useActionState } from 'react';
import { publishEventAction, type PublishEventState } from '@/app/actions/organiser';

const initialState: PublishEventState = {};

/** Publishes one draft. Shows why, if the event can't go on sale yet. */
export function PublishButton({ eventId, title }: { eventId: string; title: string }) {
  const [state, action, pending] = useActionState(publishEventAction, initialState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="eventId" value={eventId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Publish ${title}`}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? 'Publishing…' : 'Publish'}
      </button>
      {state.message && !pending && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
