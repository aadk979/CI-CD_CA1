'use client';

import { useActionState, useState } from 'react';
import { createEventAction, type CreateEventState } from '@/app/actions/organiser';
import { FormError, FormField, SubmitButton } from '@/components/auth/form-field';
import { DESCRIPTION_MAX, TIER_NAME_MAX, TITLE_MAX } from '@/lib/config';
import type { VenueOption } from '@/lib/organiser';

const initialState: CreateEventState = {};

const inputClass =
  'rounded-md border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 aria-invalid:border-red-500 dark:border-zinc-700 dark:focus:border-zinc-100';

/**
 * Create-event form (SCRUM-28). The browser hints help, but every rule is enforced again by
 * the Server Action, so a tampered request gets the same errors back.
 */
export function EventForm({ venues, minStartsAt }: { venues: VenueOption[]; minStartsAt: string }) {
  const [state, action, pending] = useActionState(createEventAction, initialState);
  const [venueId, setVenueId] = useState(state.values?.venueId || venues[0]?.id || '');
  const venue = venues.find((v) => v.id === venueId);
  const errors = state.fieldErrors ?? {};
  const value = (name: string) => state.values?.[name];

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <FormField
        name="title"
        label="Title"
        required
        maxLength={TITLE_MAX}
        defaultValue={value('title')}
        error={errors.title}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-description" className="text-sm font-medium">
          Description <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="field-description"
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          defaultValue={value('description')}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'field-description-error' : undefined}
          className={inputClass}
        />
        {errors.description && (
          <p id="field-description-error" role="alert" className="text-sm text-red-600">
            {errors.description}
          </p>
        )}
      </div>

      <FormField
        name="startsAt"
        label="Starts at (Singapore time)"
        type="datetime-local"
        required
        min={minStartsAt}
        defaultValue={value('startsAt')}
        error={errors.startsAt}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="field-venueId" className="text-sm font-medium">
          Venue
        </label>
        <select
          // React resets the form after each action, which puts a select back to the
          // option that was default when it mounted, even if it is controlled. Remounting
          // it per submitted venue makes that default the venue the organiser chose, so
          // it can't drift from the price fields below.
          key={state.values?.venueId ?? 'initial'}
          id="field-venueId"
          name="venueId"
          defaultValue={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          aria-invalid={errors.venueId ? true : undefined}
          className={inputClass}
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}, {v.city}
            </option>
          ))}
        </select>
        {errors.venueId && (
          <p role="alert" className="text-sm text-red-600">
            {errors.venueId}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Prices</legend>
        <p className="text-sm text-zinc-500">
          Price each section in S$. Leave a price blank to keep that section off sale.
        </p>
        <FormError message={errors.prices} />
        {venue?.sections.map((section) => (
          <div key={section.id} className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <FormField
              name={`price.${section.id}`}
              label={`${section.name} price`}
              hint={`${section.seats} seats`}
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={value(`price.${section.id}`)}
              error={errors[`price.${section.id}`]}
            />
            <FormField
              name={`tier.${section.id}`}
              label={`${section.name} tier name`}
              placeholder={section.name}
              maxLength={TIER_NAME_MAX}
              defaultValue={value(`tier.${section.id}`)}
              error={errors[`tier.${section.id}`]}
            />
          </div>
        ))}
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="waitingRoom"
          defaultChecked={value('waitingRoom') === 'on'}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">High demand: use the virtual waiting room</span>
          <span className="block text-zinc-500">
            Fans queue and are let in to pick seats in batches.
          </span>
        </span>
      </label>

      <SubmitButton pending={pending}>Save as draft</SubmitButton>
    </form>
  );
}
