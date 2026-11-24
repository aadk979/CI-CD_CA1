'use client';

import { useActionState } from 'react';
import { registerAction } from '@/app/actions/auth';
import type { FormState, RegisterInput } from '@/lib/auth-validation';
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/config';
import { FormError, FormField, SubmitButton } from './form-field';

const initialState: FormState<RegisterInput> = { ok: false };

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    // noValidate: show our own server-validated messages consistently next to each field.
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <FormError message={state.formError} />
      <FormField
        name="name"
        label="Name"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters`}
        error={state.fieldErrors?.password}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-1 text-sm font-medium">I want to</legend>
        <label className="border-hairline-strong bg-surface-2 rounded-btn has-[:checked]:border-violet-soft has-[:checked]:bg-violet/10 has-[:focus-visible]:ring-violet-soft text-body flex cursor-pointer items-center gap-3 border px-3 py-3 text-sm font-normal transition has-[:focus-visible]:ring-2">
          <input
            type="radio"
            name="accountType"
            value="fan"
            defaultChecked
            className="accent-violet-soft"
          />
          Buy tickets
        </label>
        <label className="border-hairline-strong bg-surface-2 rounded-btn has-[:checked]:border-violet-soft has-[:checked]:bg-violet/10 has-[:focus-visible]:ring-violet-soft text-body flex cursor-pointer items-center gap-3 border px-3 py-3 text-sm font-normal transition has-[:focus-visible]:ring-2">
          <input type="radio" name="accountType" value="organiser" className="accent-violet-soft" />
          Sell tickets as an organiser (create and publish events)
        </label>
      </fieldset>
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
