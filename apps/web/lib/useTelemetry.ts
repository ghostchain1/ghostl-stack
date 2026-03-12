"use client";

import { useEffect, useRef, useState } from "react";

export interface TelemetryEvent {
  ts: number;
  type: string;
  source: string;
  payload: Record<string, unknown>;
}

interface UseTelemetryOptions {
  url: string;
  maxEvents?: number;
  enabled?: boolean;
}

export function useTelemetry({ url, maxEvents = 100, enabled = true }: UseTelemetryOptions) {
  const [events, setEvents]       = useState<TelemetryEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const wsRef                     = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    function connect() {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setError(null);
        };

        ws.onmessage = (evt) => {
          try {
            const raw = JSON.parse(String(evt.data)) as Partial<TelemetryEvent>;
            const event: TelemetryEvent = {
              ts:      raw.ts      ?? Date.now(),
              type:    raw.type    ?? "unknown",
              source:  raw.source  ?? "unknown",
              payload: raw.payload ?? {},
            };
            setEvents(prev => [event, ...prev].slice(0, maxEvents));
          } catch { /* ignore malformed messages */ }
        };

        ws.onerror = () => {
          setError("WebSocket connection error");
        };

        ws.onclose = () => {
          setConnected(false);
          // Reconnect after 5 s if not deliberately closed
          setTimeout(() => {
            if (wsRef.current === ws) connect();
          }, 5_000);
        };
      } catch (err) {
        setError(String(err));
      }
    }

    connect();

    return () => {
      const ws = wsRef.current;
      if (ws) {
        wsRef.current = null; // prevent reconnect
        ws.close();
      }
    };
  }, [url, maxEvents, enabled]);

  function clearEvents() {
    setEvents([]);
  }

  return { events, connected, error, clearEvents };
}
