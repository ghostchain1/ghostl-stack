/**
 * sse-client.ts — Server-Sent Events (SSE) client helpers.
 *
 * Why SSE over WebSocket?
 *   Next.js App Router does not support HTTP-upgrade (WebSocket) within
 *   route handlers.  SSE provides real-time server→client streaming with
 *   automatic reconnect, text-based framing, and no extra infrastructure.
 *
 * Usage:
 *   const unsub = subscribeSSE('/api/events', (event) => { ... });
 *   // later:
 *   unsub();
 */

export type SSEEventType =
  | 'chain.block'
  | 'chain.gas'
  | 'chain.health'
  | 'validator.update'
  | 'ai.recommendation'
  | 'ai.swarm'
  | 'treasury.update'
  | 'infra.container'
  | 'infra.vm'
  | 'governance.proposal'
  | 'bridge.transfer'
  | 'heartbeat';

export interface SSEEvent<D = unknown> {
  type: SSEEventType;
  data: D;
  ts: string;  // ISO-8601
}

type SSECallback = (event: SSEEvent) => void;
type UnsubFn     = () => void;

/**
 * Open an SSE stream to `url` and call `onEvent` for each parsed event.
 * Returns an unsubscribe function that closes the EventSource.
 *
 * Automatically reconnects (browser native behaviour) on network errors.
 */
export function subscribeSSE(url: string, onEvent: SSECallback): UnsubFn {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener('message', (raw: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(raw.data) as SSEEvent;
      onEvent(parsed);
    } catch {
      // malformed event — ignore
    }
  });

  // Named event types are also dispatched individually
  const handleNamed = (raw: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(raw.data) as SSEEvent;
      onEvent(parsed);
    } catch {
      // ignore
    }
  };

  const eventTypes: SSEEventType[] = [
    'chain.block',
    'chain.gas',
    'chain.health',
    'validator.update',
    'ai.recommendation',
    'ai.swarm',
    'treasury.update',
    'infra.container',
    'infra.vm',
    'governance.proposal',
    'bridge.transfer',
    'heartbeat',
  ];

  for (const t of eventTypes) {
    source.addEventListener(t, handleNamed);
  }

  source.addEventListener('error', () => {
    // EventSource reconnects automatically — no action needed
  });

  return () => {
    for (const t of eventTypes) {
      source.removeEventListener(t, handleNamed);
    }
    source.close();
  };
}

/** Helper: format a timestamp string as "HH:MM:SS". */
export function formatSSETime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
