'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { EASE_OUT_EXPO } from './tokens';

const format = (n: number) => n.toLocaleString('en-SG');

/**
 * Counts up to `value` once it scrolls into view. The final number is server-rendered, so
 * no-JS visitors see it, screen readers read it once (the ticking copy is aria-hidden), and
 * reduced-motion users get it straight away. Writes to the DOM directly: no re-renders.
 */
export function CountUp({
  value,
  suffix = '',
  prefix = '',
  duration = 1.4,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!inView || reduce || !node) return;
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT_EXPO,
      onUpdate: (v) => {
        node.textContent = `${prefix}${format(Math.round(v))}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration, prefix, suffix]);

  return (
    <span className="tabular-nums">
      <span ref={ref} aria-hidden>
        {prefix}
        {format(value)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {format(value)}
        {suffix}
      </span>
    </span>
  );
}
