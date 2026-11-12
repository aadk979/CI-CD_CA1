/**
 * Shared Socket.IO contract — imported by the server, the worker and the browser,
 * so event names and payloads stay type-safe end to end.
 */

export const SOCKET_PATH = '/socket.io';

export interface HeartbeatPayload {
  /** ISO timestamp of when the worker last processed a heartbeat job. */
  at: string;
}

export interface ServerToClientEvents {
  'server:hello': (payload: { connectedAt: string }) => void;
  'system:heartbeat': (payload: HeartbeatPayload) => void;
}

export interface ClientToServerEvents {
  'event:join': (eventId: string) => void;
  'event:leave': (eventId: string) => void;
}

/** Room that receives live updates (seat availability, queue position) for one event. */
export function eventRoom(eventId: string): string {
  return `event:${eventId}`;
}

const EVENT_ID_PATTERN = /^[a-z0-9-]{1,64}$/i;

/** Guard against arbitrary room names sent by clients. */
export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID_PATTERN.test(value);
}
