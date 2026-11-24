import Link from 'next/link';
import { button } from '@/components/ui/styles';

export default function EventNotFound() {
  return (
    <div className="py-10">
      <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">404</p>
      <h1 className="font-display text-display-sm text-ink font-semibold">Event not found</h1>
      <p className="text-body mt-2">This event doesn&apos;t exist or is no longer listed.</p>
      <Link href="/events" className={`${button.primary} mt-6`}>
        Browse upcoming events
      </Link>
    </div>
  );
}
