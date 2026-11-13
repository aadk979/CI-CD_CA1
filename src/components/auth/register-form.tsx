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
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
