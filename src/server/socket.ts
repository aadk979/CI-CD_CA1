import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Server } from 'socket.io';
import {
  SOCKET_PATH,
  eventRoom,
  isValidEventId,
  queueRoom,
  type ClientToServerEvents,
  type QueueUpdatePayload,
  type ServerToClientEvents,
} from '@/lib/realtime';

export type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface SocketServerOptions {
  /** Redis pub/sub pair. Enables broadcasting from other processes (e.g. the BullMQ worker). */
  redis?: { pubClient: Redis; subClient: Redis };
  /** Current waiting-room numbers, sent to a fan as soon as they start watching a queue. */
  queueStats?: (eventId: string) => Promise<QueueUpdatePayload>;
}

export function createSocketServer(
  httpServer: HttpServer,
  options: SocketServerOptions = {},
): SocketServer {
  const io: SocketServer = new Server(httpServer, {
    path: SOCKET_PATH,
    // Leave non-Socket.IO upgrade requests (e.g. Next.js HMR in dev) alone.
    destroyUpgrade: false,
    adapter: options.redis
      ? createAdapter(options.redis.pubClient, options.redis.subClient)
      : undefined,
  });

  io.on('connection', (socket) => {
    socket.emit('server:hello', { connectedAt: new Date().toISOString() });

    socket.on('event:join', (eventId) => {
      if (isValidEventId(eventId)) void socket.join(eventRoom(eventId));
    });

    socket.on('event:leave', (eventId) => {
      if (isValidEventId(eventId)) void socket.leave(eventRoom(eventId));
    });

    socket.on('queue:watch', async (eventId, ack) => {
      if (!isValidEventId(eventId)) {
        if (typeof ack === 'function') ack(null);
        return;
      }
      await socket.join(queueRoom(eventId));
      if (typeof ack !== 'function') return;
      // Read the numbers only after joining, so no broadcast can slip in between.
      try {
        ack(options.queueStats ? await options.queueStats(eventId) : null);
      } catch (err) {
        console.error('Could not read queue stats', err);
        ack(null);
      }
    });

    socket.on('queue:unwatch', (eventId) => {
      if (isValidEventId(eventId)) void socket.leave(queueRoom(eventId));
    });
  });

  return io;
}
