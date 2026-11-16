'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatCountdown } from '@/lib/format';

/**
 * Ticks down to a deadline (a hold's expiry, or a waiting-room pass), then re-renders the
 * page so it reflects what lapsed: released seats, or a trip back to the queue.
 */
export function HoldCountdown({
  expiresAt,
  testId = 'hold-countdown',
}: {
  expiresAt: string;
  testId?: string;
}) {
  const router = useRouter();
  const deadline = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        // Give the expiry job a moment to run, then fetch fresh availability.
        setTimeout(() => router.refresh(), 1500);
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [deadline, router]);

  // Rendered on the server too: show nothing until the browser's clock takes over,
  // so server and client markup match.
  return (
    <span className="font-mono tabular-nums" data-testid={testId}>
      {remaining === null ? '—' : formatCountdown(remaining)}
    </span>
  );
}
