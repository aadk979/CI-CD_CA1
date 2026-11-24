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
  connecting: 'bg-amber-soft',
  live: 'bg-live animate-live-pulse',
  offline: 'bg-danger',
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
    <div className="border-hairline bg-surface/80 text-muted inline-flex flex-wrap items-center gap-3 rounded-full border px-3 py-1.5 text-xs backdrop-blur">
      <span
        className="text-ink flex items-center gap-2 font-semibold"
        data-testid="connection-status"
      >
        <span className={`h-2 w-2 rounded-full ${DOT[state]}`} aria-hidden />
        {LABELS[state]}
      </span>
      {lastHeartbeat && (
        <span data-testid="worker-heartbeat">
          Worker heartbeat {new Date(lastHeartbeat).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
