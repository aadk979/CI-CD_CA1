import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/reveal';
import { container } from '@/components/ui/styles';

/**
 * A marketing band: 96px vertical rhythm, max 1200px content. Consecutive bands alternate
 * between the canvas and the raised surface so each one reads as its own block.
 */
export function Band({
  children,
  surface = 'canvas',
  id,
  labelledBy,
}: {
  children: ReactNode;
  surface?: 'canvas' | 'raised';
  id?: string;
  labelledBy?: string;
}) {
  const bg = surface === 'raised' ? 'border-y border-hairline bg-canvas-raised' : 'bg-canvas';
  return (
    <section id={id} aria-labelledby={labelledBy} className={`relative ${bg} py-section`}>
      <div className={container}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = 'center',
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'center' | 'left';
}) {
  const centred = align === 'center' ? 'mx-auto text-center' : '';
  return (
    <Reveal className={`mb-14 max-w-2xl ${centred}`}>
      <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="font-display text-display-sm text-ink md:text-display-md lg:text-display-lg font-semibold"
      >
        {title}
      </h2>
      {lead && <p className="text-body mt-4 text-lg">{lead}</p>}
    </Reveal>
  );
}
