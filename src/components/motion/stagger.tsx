'use client';

import { motion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { DURATION, EASE_OUT_EXPO } from './tokens';

const group: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slower, ease: EASE_OUT_EXPO },
  },
};

/** Entrance stagger for a group (the hero): children marked StaggerItem rise in turn. */
export function StaggerGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={group} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
