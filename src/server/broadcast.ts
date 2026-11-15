import { Emitter } from '@socket.io/redis-emitter';
import { createRedis } from '@/lib/redis';
import { eventRoom, type SeatsUpdatePayload, type ServerToClientEvents } from '@/lib/realtime';

/** The part of a Socket.IO emitter (or server) that broadcasting needs. */
export interface RoomEmitter {
  to(room: string): { emit(event: 'seats:update', payload: SeatsUpdatePayload): unknown };
}

/**
 * Tell everyone viewing an event that some of its seats changed. Sent to the event's
 * room only, so fans looking at other events get nothing. No-op for an empty list.
 */
export function broadcastSeats(
  emitter: RoomEmitter,
  eventId: string,
  seatIds: string[],
  status: SeatsUpdatePayload['status'],
): void {
  if (seatIds.length === 0) return;
  emitter.to(eventRoom(eventId)).emit('seats:update', { eventId, seatIds, status });
}

const globalForEmitter = globalThis as unknown as {
  socketEmitter?: Emitter<ServerToClientEvents>;
};

/**
 * Publishes to connected browsers through Redis, from any process (web or worker),
 * without needing the Socket.IO server instance. Created on first use.
 */
export function getEmitter(): Emitter<ServerToClientEvents> {
  globalForEmitter.socketEmitter ??= new Emitter<ServerToClientEvents>(createRedis());
  return globalForEmitter.socketEmitter;
}
