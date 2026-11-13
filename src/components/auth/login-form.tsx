'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import type { FormState, LoginInput } from '@/lib/auth-validation';
import { FormError, FormField, SubmitButton } from './form-field';

const initialState: FormState<LoginInput> = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      <FormError message={state.formError} />
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}
