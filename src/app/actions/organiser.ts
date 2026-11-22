'use server';

import 'server-only';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { getPrisma } from '@/lib/db';
import { readEventForm, validateEventForm, type EventFieldErrors } from '@/lib/event-form';
import { EVENTS_CACHE_TAG } from '@/lib/events';
import { isValidId } from '@/lib/holds';
import { createEvent, publishEvent, PUBLISH_MESSAGES } from '@/lib/organiser';
import { requireOrganiser } from '@/server/organiser';

export interface CreateEventState {
  fieldErrors?: EventFieldErrors;
  /** What was typed, so a validation error doesn't clear the form. */
  values?: Record<string, string>;
}

/** Create an event as a DRAFT (SCRUM-28). Validated here, on the server, whatever the form did. */
export async function createEventAction(
  _prev: CreateEventState,
  formData: FormData,
): Promise<CreateEventState> {
  // Authorisation is re-checked in every action, not left to the proxy (SCRUM-24).
  await requireOrganiser();

  const input = readEventForm(formData);
  const values: Record<string, string> = {
    title: input.title,
    description: input.description,
    venueId: input.venueId,
    startsAt: input.startsAt,
    waitingRoom: input.waitingRoom ? 'on' : '',
  };
  for (const [id, { price, tier }] of Object.entries(input.sections)) {
    values[`price.${id}`] = price;
    values[`tier.${id}`] = tier;
  }

  const valid = validateEventForm(input);
  if (!valid.ok) return { fieldErrors: valid.fieldErrors, values };

  const created = await createEvent(getPrisma(), valid.data);
  if (!created.ok) return { fieldErrors: created.fieldErrors, values };

  // A draft isn't on the public list, so there is no cache to expire yet.
  redirect(`/organiser?created=${created.event.slug}`);
}

export interface PublishEventState {
  message?: string;
}

/** Put a DRAFT event on sale, and refresh the public event list straight away. */
export async function publishEventAction(
  _prev: PublishEventState,
  formData: FormData,
): Promise<PublishEventState> {
  await requireOrganiser();

  const eventId = formData.get('eventId');
  if (typeof eventId !== 'string' || !isValidId(eventId)) {
    return { message: PUBLISH_MESSAGES['not-found'] };
  }

  const result = await publishEvent(getPrisma(), eventId);
  if (!result.ok) return { message: PUBLISH_MESSAGES[result.code] };

  // Read-your-own-writes: the next request for the cached event list waits for fresh
  // data, so the event is on the home page as soon as the organiser looks.
  updateTag(EVENTS_CACHE_TAG);
  redirect(`/organiser?published=${result.slug}`);
}
