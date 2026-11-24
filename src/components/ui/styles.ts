/**
 * Shared class recipes for the design system. Plain strings (no runtime), so Server and
 * Client Components can both use them. Every value comes from the tokens in globals.css.
 */

const buttonBase =
  'inline-flex h-10 items-center justify-center gap-2 rounded-btn px-4 text-sm font-semibold whitespace-nowrap transition duration-150 ease-out-expo disabled:cursor-not-allowed disabled:opacity-50';

export const button = {
  /** One clear primary action per band: bright white on the dark canvas. */
  primary: `${buttonBase} bg-ink text-on-light shadow-cta hover:bg-white hover:shadow-cta-hover active:scale-[0.98]`,
  secondary: `${buttonBase} border border-hairline-strong bg-surface-2 text-ink hover:border-violet-soft/60 hover:bg-surface-3`,
  ghost: `${buttonBase} text-body hover:bg-surface-2 hover:text-ink`,
  /** Text-only action, e.g. "Release seats". */
  link: 'text-sm font-medium text-body underline decoration-hairline-strong underline-offset-4 transition hover:text-ink hover:decoration-violet-soft',
  /** Icon-only circular button (needs an aria-label). */
  icon: 'inline-flex h-10 w-10 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-ink transition hover:bg-surface-3',
} as const;

export const input =
  'h-10 w-full rounded-btn border border-hairline-strong bg-surface px-3 text-sm text-ink placeholder:text-muted transition outline-none focus:border-violet-soft focus:ring-2 focus:ring-violet/30 aria-invalid:border-danger';

export const card = 'rounded-card border border-hairline bg-surface shadow-card';

export const badge =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold';

export const badgeTone = {
  neutral: 'border-hairline-strong bg-surface-2 text-body',
  live: 'border-live/30 bg-live/10 text-live',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-amber-soft/30 bg-amber-soft/10 text-amber-soft',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  brand: 'border-violet-soft/30 bg-violet/15 text-violet-soft',
} as const;

/** Callout boxes for page-level messages. */
export const notice = {
  success: 'rounded-card border border-success/25 bg-success/10 px-4 py-3 text-sm text-ink',
  warning: 'rounded-card border border-amber-soft/25 bg-amber-soft/10 px-4 py-3 text-sm text-ink',
  danger: 'rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-ink',
  info: 'rounded-card border border-hairline-strong bg-surface-2 px-4 py-3 text-sm text-body',
} as const;

export const eyebrow = 'text-xs font-semibold tracking-[0.14em] uppercase';

export const container = 'mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8';
