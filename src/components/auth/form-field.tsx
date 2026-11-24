import type { InputHTMLAttributes } from 'react';
import { button, input, notice } from '@/components/ui/styles';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Labelled input with its validation error rendered (and announced) right beneath it. */
export function FormField({ name, label, error, hint, ...rest }: FormFieldProps) {
  const id = `field-${name}`;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={input}
        {...rest}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={notice.danger}>
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button type="submit" disabled={pending} className={`${button.primary} w-full`}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}
