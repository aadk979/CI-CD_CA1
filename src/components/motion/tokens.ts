/** Motion tokens for JS animations; mirror the CSS ones in globals.css (--ease-*, --duration-*). */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.5, slower: 0.8 } as const;
export const SPRING = { type: 'spring', stiffness: 380, damping: 26 } as const;
