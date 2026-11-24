'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * App-wide Motion settings. `reducedMotion="user"` follows the OS "reduce motion" setting:
 * transform and layout animations are skipped, so content just appears in place.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
