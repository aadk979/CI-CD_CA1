import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SOCKET_PATH,
  eventRoom,
  type ClientToServerEvents,
  type SeatsUpdatePayload,
  type ServerToClientEvents,
} from '@/lib/realtime';
import { createRedis } from '@/lib/redis';
import { broadcastSeats, getEmitter } from '@/server/broadcast';
import { HEARTBEAT_KEY, createHeartbeatProcessor } from '@/server/jobs/heartbeat';
import { JOB_NAMES, QUEUE_NAMES, createQueue } from '@/server/queues';
import { createSocketServer, type SocketServer } from '@/server/socket';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * End-to-end through real infrastructure:
 * BullMQ job → worker processor → Redis emitter → Socket.IO Redis adapter → browser client.
 */
describe('realtime pipeline (Socket.IO + Redis adapter + BullMQ)', () => {
  let httpServer: HttpServer;
  let io: SocketServer;
  let url: string;
  const redisClients: Redis[] = [];
  const sockets: ClientSocket[] = [];

  const redis = () => {
    const client = createRedis();
    redisClients.push(client);
    return client;
  };

  function client(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket: ClientSocket = connect(url, { path: SOCKET_PATH, transports: ['websocket'] });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  beforeAll(async () => {
    httpServer = createServer();
    const pubClient = redis();
    io = createSocketServer(httpServer, { redis: { pubClient, subClient: redis() } });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await io.close();
    await Promise.allSettled(redisClients.map((c) => c.quit()));
  });

  it('greets new connections', async () => {
    const socket = connect(url, { path: SOCKET_PATH, transports: ['websocket'] });
    sockets.push(socket);
    const hello = await new Promise<{ connectedAt: string }>((resolve) =>
      socket.on('server:hello', resolve),
    );
    expect(new Date(hello.connectedAt).toString()).not.toBe('Invalid Date');
  });

  it('delivers broadcasts from another process only to sockets in the event room', async () => {
    const inRoom = await client();
    const outside = await client();
    inRoom.emit('event:join', 'evt-1');
    outside.emit('event:join', 'evt-2');
    await new Promise((r) => setTimeout(r, 100)); // let joins propagate

    const emitter = new Emitter<ServerToClientEvents>(redis());
    const received: string[] = [];
    outside.on('system:heartbeat', () => received.push('outside'));
    const delivered = new Promise<void>((resolve) =>
      inRoom.on('system:heartbeat', () => {
        received.push('inRoom');
        resolve();
      }),
    );

    emitter.to(eventRoom('evt-1')).emit('system:heartbeat', { at: 'now' });
    await delivered;
    await new Promise((r) => setTimeout(r, 100));

    expect(received).toEqual(['inRoom']);
  });

  it('ignores invalid room names and supports leaving a room', async () => {
    const socket = await client();
    socket.emit('event:join', 'evt-3');
    socket.emit('event:join', 'bad room!' as string);
    socket.emit('event:leave', 'evt-3');
    socket.emit('event:leave', '' as string);
    await new Promise((r) => setTimeout(r, 100));

    const rooms = await io.in(socket.id!).fetchSockets();
    expect([...(rooms[0]?.rooms ?? [])]).toEqual([socket.id]);
  });

  it('processes a heartbeat job and pushes it to connected browsers', async () => {
    const socket = await client();
    const emitter = new Emitter<ServerToClientEvents>(redis());
    const queueConn = redis();
    const queue = createQueue(QUEUE_NAMES.system, queueConn);
    const processor = createHeartbeatProcessor({
      redis: queueConn,
      emit: (p) => emitter.emit('system:heartbeat', p),
    });
    const worker = new Worker(QUEUE_NAMES.system, () => processor(), { connection: redis() });

    const heartbeat = new Promise<{ at: string }>((resolve) =>
      socket.on('system:heartbeat', resolve),
    );
    await queue.add(JOB_NAMES.heartbeat, {});

    const payload = await heartbeat;
    expect(await queueConn.get(HEARTBEAT_KEY)).toBe(payload.at);

    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('pushes seat changes to viewers of that event within 1 second, and to nobody else (SCRUM-38)', async () => {
    const viewer = await client();
    const otherEvent = await client();
    viewer.emit('event:join', 'evt-seats');
    otherEvent.emit('event:join', 'evt-other');
    await new Promise((r) => setTimeout(r, 100));

    const leaked: SeatsUpdatePayload[] = [];
    otherEvent.on('seats:update', (p) => leaked.push(p));
    const received = new Promise<SeatsUpdatePayload>((resolve) =>
      viewer.on('seats:update', resolve),
    );

    const sentAt = Date.now();
    broadcastSeats(getEmitter(), 'evt-seats', ['seatA', 'seatB'], 'taken');
    const update = await received;
    const latency = Date.now() - sentAt;
    await new Promise((r) => setTimeout(r, 100));

    expect(update).toEqual({ eventId: 'evt-seats', seatIds: ['seatA', 'seatB'], status: 'taken' });
    expect(latency).toBeLessThan(1000);
    expect(leaked).toEqual([]);
  });

  it('getEmitter reuses one Redis publisher per process', () => {
    expect(getEmitter()).toBe(getEmitter());
  });
});
