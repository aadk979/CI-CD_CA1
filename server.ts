/**
 * Custom Next.js server.
 *
 * Next.js's built-in server can't hold long-lived WebSocket connections, so this
 * process hosts both the Next.js request handler and a Socket.IO server on the
 * same HTTP port. Socket.IO uses the Redis adapter so other processes (the BullMQ
 * worker) can broadcast to connected browsers.
 */
import { createServer } from 'node:http';
import { loadEnv } from '@/lib/load-env';
import next from 'next';
import { getEnv } from '@/lib/env';
import { createRedis } from '@/lib/redis';
import { createSocketServer } from '@/server/socket';

const dev = process.env.NODE_ENV !== 'production';
loadEnv(dev);

async function main() {
  const { PORT } = getEnv();
  const httpServer = createServer();

  const app = next({ dev, httpServer, hostname: '0.0.0.0', port: PORT });
  const handle = app.getRequestHandler();
  await app.prepare();

  httpServer.on('request', (req, res) => {
    void handle(req, res);
  });

  const pubClient = createRedis();
  const subClient = pubClient.duplicate();
  const io = createSocketServer(httpServer, { redis: { pubClient, subClient } });

  // 0.0.0.0 so the reverse proxy (Caddy) / container network can reach us.
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `> Server ready on http://localhost:${PORT} (${dev ? 'development' : 'production'})`,
    );
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — shutting down gracefully`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    await io.close(); // also closes the HTTP server
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
