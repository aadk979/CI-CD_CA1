/** Display name used across the UI. Rename freely — it's only referenced from here. */
export const APP_NAME = 'TixQueue';

/** Password length rules — shared by server validation and the register form. */
export const PASSWORD_MIN = 8;
/** Upper bound keeps hashing cost bounded and matches the acceptance criteria. */
export const PASSWORD_MAX = 72;

/** How long seats stay in a fan's cart. One timer per cart: seats added later share it. */
export const HOLD_DURATION_MS = 10 * 60 * 1000;
/** Most seats one fan can hold (or buy) for one event at a time. */
export const MAX_SEATS_PER_ORDER = 6;

/**
 * How long a fan admitted from the waiting room may shop before the pass lapses.
 * Longer than a hold, so a fan admitted late in the window can still finish a 10-minute cart.
 */
export const ACCESS_PASS_TTL_MS = 15 * 60 * 1000;

/** Create-event form limits (SCRUM-28): shared by server validation and the form. */
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const TIER_NAME_MAX = 40;
