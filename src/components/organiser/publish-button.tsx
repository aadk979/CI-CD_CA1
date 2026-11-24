'use client';

import { useActionState } from 'react';
import { publishEventAction, type PublishEventState } from '@/app/actions/organiser';
import { button } from '@/components/ui/styles';

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
        className={`${button.primary} h-9`}
      >
        {pending ? 'Publishing…' : 'Publish'}
      </button>
      {state.message && !pending && (
        <p role="alert" className="text-danger text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
