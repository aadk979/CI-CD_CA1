'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { DURATION, EASE_OUT_EXPO } from './tokens';

/**
 * Deals a ticket in: it rises and flips forward from a slight tilt, staggered by index.
 * Under reduced motion only the fade remains (MotionConfig skips transforms).
 */
export function TicketReveal({
  children,
  index = 0,
  className,
  testId,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
  testId?: string;
}) {
  return (
    <motion.li
      className={className}
      data-testid={testId}
      style={{ transformPerspective: 900 }}
      initial={{ opacity: 0, y: 28, rotateX: -18 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: DURATION.slower, ease: EASE_OUT_EXPO, delay: 0.1 + index * 0.12 }}
    >
      {children}
    </motion.li>
  );
}
