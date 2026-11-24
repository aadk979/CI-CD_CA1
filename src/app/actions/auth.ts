'use server';

import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { logIn, logOut, registerAccount } from '@/lib/account';
import { getAuth } from '@/lib/auth';
import { getPrisma } from '@/lib/db';
import {
  formToObject,
  type FormState,
  type LoginInput,
  type RegisterInput,
} from '@/lib/auth-validation';

// Server Actions are public endpoints: every input is re-validated in lib/account.

export async function registerAction(
  _prev: FormState<RegisterInput>,
  formData: FormData,
): Promise<FormState<RegisterInput>> {
  const input = formToObject(formData, ['name', 'email', 'password', 'accountType']);
  const requestHeaders = await headers();
  const result = await registerAccount(getAuth(), input, requestHeaders, getPrisma());
  // Signed in automatically; session cookie already set. Organisers land in their back office.
  if (result.ok) redirect(result.organiser ? '/organiser' : '/');
  return result;
}

export async function loginAction(
  _prev: FormState<LoginInput>,
  formData: FormData,
): Promise<FormState<LoginInput>> {
  const input = formToObject(formData, ['email', 'password']);
  const requestHeaders = await headers();
  const result = await logIn(getAuth(), input, requestHeaders);
  if (result.ok) redirect('/');
  return result;
}

export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  await logOut(getAuth(), requestHeaders);
  redirect('/');
}
