import { describe, expect, it, vi } from 'vitest';
import { broadcastQueue, broadcastSeats } from '@/server/broadcast';

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

describe('broadcastQueue', () => {
  it("sends the queue's progress to that event's waiting room only", () => {
    const { emitter, to, emit } = fakeEmitter();

    broadcastQueue(emitter, { eventId: 'evt1', servedThrough: 100, waiting: 42 });

    expect(to).toHaveBeenCalledWith('queue:evt1');
    expect(emit).toHaveBeenCalledWith('queue:update', {
      eventId: 'evt1',
      servedThrough: 100,
      waiting: 42,
    });
  });

  it('sends only the public numbers, never who was admitted', () => {
    const { emitter, emit } = fakeEmitter();
    const batch = { eventId: 'evt1', servedThrough: 2, waiting: 0, admitted: ['usr1', 'usr2'] };

    broadcastQueue(emitter, batch);

    expect(emit.mock.calls[0][1]).not.toHaveProperty('admitted');
  });
});
