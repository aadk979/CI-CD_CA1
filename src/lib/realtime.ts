/**
 * Shared Socket.IO contract — imported by the server, the worker and the browser,
 * so event names and payloads stay type-safe end to end.
 */

export const SOCKET_PATH = '/socket.io';

export interface HeartbeatPayload {
  /** ISO timestamp of when the worker last processed a heartbeat job. */
  at: string;
}

/** Seats of one event changed hands: now held/sold ("taken") or free again ("available"). */
export interface SeatsUpdatePayload {
  eventId: string;
  seatIds: string[];
  status: 'taken' | 'available';
}

/**
 * A waiting room moved. Every fan works out their own position from this
 * (`ticket - servedThrough`), so one broadcast serves the whole queue.
 */
export interface QueueUpdatePayload {
  eventId: string;
  /** Highest ticket admitted so far. */
  servedThrough: number;
  /** Fans still waiting. */
  waiting: number;
}

export interface ServerToClientEvents {
  'server:hello': (payload: { connectedAt: string }) => void;
  'system:heartbeat': (payload: HeartbeatPayload) => void;
  'seats:update': (payload: SeatsUpdatePayload) => void;
  'queue:update': (payload: QueueUpdatePayload) => void;
}

export interface ClientToServerEvents {
  'event:join': (eventId: string) => void;
  'event:leave': (eventId: string) => void;
  /**
   * Follow an event's waiting room. The server acknowledges with the current numbers,
   * so a batch admitted between page render and joining the room is never missed.
   */
  'queue:watch': (eventId: string, ack?: (stats: QueueUpdatePayload | null) => void) => void;
  'queue:unwatch': (eventId: string) => void;
}

/** Room that receives live seat availability for one event. */
export function eventRoom(eventId: string): string {
  return `event:${eventId}`;
}

/** Room for fans waiting in one event's queue. */
export function queueRoom(eventId: string): string {
  return `queue:${eventId}`;
}

const EVENT_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

/** Guard against arbitrary room names sent by clients. */
export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID_PATTERN.test(value);
}
