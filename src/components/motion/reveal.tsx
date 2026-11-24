'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { DURATION, EASE_OUT_EXPO } from './tokens';

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: DURATION.slower, ease: EASE_OUT_EXPO, delay }}
    >
      {children}
    </Tag>
  );
}

/** A card that lifts slightly on hover and keyboard focus. */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -4 }}
      whileFocus={{ y: -4 }}
      transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}
