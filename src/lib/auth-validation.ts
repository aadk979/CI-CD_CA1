import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN } from './config';

export { PASSWORD_MAX, PASSWORD_MIN };

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }).max(254, 'Email is too long'));

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter your name')
    .max(100, 'Name must be 100 characters or fewer'),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Password must be ${PASSWORD_MAX} characters or fewer`),
});

/** Login only checks presence: revealing password rules here would leak nothing useful. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * State returned to `useActionState`. `values` echoes back what the user typed
 * (never the password) so the form doesn't clear on a validation error.
 */
export interface FormState<T> {
  ok: boolean;
  fieldErrors?: FieldErrors<T>;
  formError?: string;
  values?: Partial<Record<Exclude<keyof T, 'password'>, string>>;
}

/** Plain strings from a FormData (files and missing fields become ''). */
export function formToObject(
  formData: FormData,
  fields: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => {
      const value = formData.get(f);
      return [f, typeof value === 'string' ? value : ''];
    }),
  );
}

/** First error message per field, in a shape the form can render next to each input. */
export function toFieldErrors<T>(error: z.ZodError<T>): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof T;
    errors[field] ??= issue.message;
  }
  return errors;
}
