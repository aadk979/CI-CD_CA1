'use client';

import { useActionState, useState } from 'react';
import { createEventAction, type CreateEventState } from '@/app/actions/organiser';
import { FormError, FormField, SubmitButton } from '@/components/auth/form-field';
import { input } from '@/components/ui/styles';
import { DESCRIPTION_MAX, TIER_NAME_MAX, TITLE_MAX } from '@/lib/config';
import type { VenueOption } from '@/lib/organiser';

const initialState: CreateEventState = {};

const inputClass = input;

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
        <label htmlFor="field-description" className="text-ink text-sm font-medium">
          Description <span className="text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="field-description"
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          defaultValue={value('description')}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'field-description-error' : undefined}
          className={`${inputClass} h-auto py-2`}
        />
        {errors.description && (
          <p id="field-description-error" role="alert" className="text-danger text-sm">
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
        <label htmlFor="field-venueId" className="text-ink text-sm font-medium">
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
          <p role="alert" className="text-danger text-sm">
            {errors.venueId}
          </p>
        )}
      </div>

      <fieldset className="border-hairline bg-surface-2/50 rounded-card flex flex-col gap-4 border p-5">
        <legend className="text-ink px-1 text-sm font-semibold">Prices</legend>
        <p className="text-muted text-sm">
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

      <label className="border-hairline-strong bg-surface-2 rounded-card has-[:checked]:border-amber-soft/60 has-[:checked]:bg-amber-soft/10 flex cursor-pointer items-start gap-3 border p-4 text-sm transition">
        <input
          type="checkbox"
          name="waitingRoom"
          defaultChecked={value('waitingRoom') === 'on'}
          className="accent-amber-soft mt-0.5"
        />
        <span>
          <span className="text-ink font-medium">High demand: use the virtual waiting room</span>
          <span className="text-muted block">
            Fans queue and are let in to pick seats in batches.
          </span>
        </span>
      </label>

      <SubmitButton pending={pending}>Save as draft</SubmitButton>
    </form>
  );
}
