'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type SeatsUpdatePayload,
  type ServerToClientEvents,
} from '@/lib/realtime';

export type LiveSeatStatus = SeatsUpdatePayload['status'];

/**
 * Live seat changes for one event (SCRUM-38). Joins the event's Socket.IO room and keeps
 * the latest status of every seat that changed since the page rendered. Callers layer this
 * over the server-rendered availability.
 *
 * After a reconnect, updates may have been missed, so it drops what it has and asks the
 * server for a fresh render instead.
 */
export function useSeatUpdates(
  eventId: string,
  /** Called for every update, e.g. to drop seats someone else just took from a selection. */
  onUpdate?: (update: SeatsUpdatePayload) => void,
): {
  changes: ReadonlyMap<string, LiveSeatStatus>;
  connected: boolean;
} {
  const router = useRouter();
  const [changes, setChanges] = useState<ReadonlyMap<string, LiveSeatStatus>>(new Map());
  const [connected, setConnected] = useState(false);
  const connectedBefore = useRef(false);
  // Latest callback without re-subscribing the socket each render.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ path: SOCKET_PATH });

    socket.on('connect', () => {
      socket.emit('event:join', eventId); // rooms don't survive a reconnect: rejoin every time
      setConnected(true);
      if (connectedBefore.current) {
        setChanges(new Map());
        router.refresh();
      }
      connectedBefore.current = true;
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('seats:update', (update) => {
      if (update.eventId !== eventId) return;
      setChanges((current) => {
        const next = new Map(current);
        for (const seatId of update.seatIds) next.set(seatId, update.status);
        return next;
      });
      onUpdateRef.current?.(update);
    });

    return () => {
      socket.disconnect();
    };
  }, [eventId, router]);

  return { changes, connected };
}
