'use client';

/**
 * useRealtimeEvents.ts — Low-level SSE hook for subscribing to the live
 * event stream.  Returns a ring buffer of the last N events.
 */

import { useEffect, useRef, useState } from 'react';
import { subscribeSSE, type SSEEvent, type SSEEventType } from '../services/sse-client';

const DEFAULT_BUFFER = 50;

export type RealtimeEventsHook = {
  events: SSEEvent[];
  connected: boolean;
  lastEvent: SSEEvent | null;
};

export function useRealtimeEvents(
  topics?: SSEEventType[],
  bufferSize = DEFAULT_BUFFER,
): RealtimeEventsHook {
  const [events, setEvents]       = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);

  const topicsStr = topics?.join(',') ?? '';
  const url = topics?.length
    ? `/api/events?topics=${encodeURIComponent(topicsStr)}`
    : '/api/events';

  const bufRef = useRef(bufferSize);
  bufRef.current = bufferSize;

  useEffect(() => {
    const unsub = subscribeSSE(url, (event: SSEEvent) => {
      if (event.type === 'heartbeat') {
        setConnected(true);
        return;
      }
      setLastEvent(event);
      setEvents(prev => {
        const next = [...prev, event];
        return next.length > bufRef.current ? next.slice(-bufRef.current) : next;
      });
    });

    // Assume connected on first successful SSE open
    setConnected(true);

    return () => {
      unsub();
      setConnected(false);
    };
  }, [url]);

  return { events, connected, lastEvent };
}
