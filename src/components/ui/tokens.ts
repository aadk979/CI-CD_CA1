/**
 * The few design tokens that must exist as JS values because they cross into a context
 * that cannot read our CSS variables: Stripe's Payment Element renders in its own iframe.
 * Keep in sync with the @theme block in src/app/globals.css.
 */
export const THEME = {
  canvas: '#07070c',
  surface: '#12121c',
  surface2: '#181826',
  ink: '#f5f5fa',
  body: '#c4c4d4',
  muted: '#8a8aa0',
  violetSoft: '#a78bfa',
  danger: '#f87171',
  success: '#34d399',
  hairline: 'rgba(255, 255, 255, 0.16)',
  radiusBtn: '8px',
} as const;
