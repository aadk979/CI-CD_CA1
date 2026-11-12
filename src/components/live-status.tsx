'use client';

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@/lib/realtime';

type ConnectionState = 'connecting' | 'live' | 'offline';

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  offline: 'Offline',
};

const DOT: Record<ConnectionState, string> = {
  connecting: 'bg-amber-400',
  live: 'bg-emerald-500',
  offline: 'bg-red-500',
};

/** Shows the WebSocket connection state and the latest worker heartbeat. */
export function LiveStatus() {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ path: SOCKET_PATH });

    socket.on('connect', () => setState('live'));
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', () => setState('offline'));
    socket.on('system:heartbeat', ({ at }) => setLastHeartbeat(at));

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="flex items-center gap-2" data-testid="connection-status">
        <span className={`h-2 w-2 rounded-full ${DOT[state]}`} aria-hidden />
        {LABELS[state]}
      </span>
      {lastHeartbeat && (
        <span data-testid="worker-heartbeat">
          · worker seen {new Date(lastHeartbeat).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
