import { describe, expect, it, vi } from 'vitest';
import { broadcastSeats } from '@/server/broadcast';

function fakeEmitter() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { emitter: { to }, to, emit };
}

describe('broadcastSeats', () => {
  it("sends the change to that event's room only", () => {
    const { emitter, to, emit } = fakeEmitter();

    broadcastSeats(emitter, 'evt1', ['s1', 's2'], 'taken');

    expect(to).toHaveBeenCalledWith('event:evt1');
    expect(emit).toHaveBeenCalledWith('seats:update', {
      eventId: 'evt1',
      seatIds: ['s1', 's2'],
      status: 'taken',
    });
  });

  it('sends nothing when no seats changed', () => {
    const { emitter, to } = fakeEmitter();

    broadcastSeats(emitter, 'evt1', [], 'available');

    expect(to).not.toHaveBeenCalled();
  });
});
