/**
 * useRealtime — WebSocket realtime data hook.
 *
 * Connects to the ghost-ws-gateway (default ws://localhost:8085) and
 * dispatches typed messages to subscribers.  Automatically reconnects
 * with exponential back-off (cap 30 s).
 *
 * Usage:
 *   const { connected, latest, blockByChain } = useRealtime();
 *
 * The hook is read-only — no write messages are sent to the gateway.
 *
 * Env:
 *   NEXT_PUBLIC_WS_GATEWAY_URL  (default ws://localhost:8085)
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlockMsg {
  type:        'block';
  chain:       string;
  blockNumber: number;
  timestamp:   number;
}

export interface HealthMsg {
  type:   'health';
  chain:  string;
  status: string;
  peers:  number;
}

export interface AIMsg {
  type:                 'ai';
  alertLevel:           string;
  activeAgents:         number;
  anomaliesDetected24h: number;
}

export interface PingMsg {
  type:       'ping';
  serverTime: string;
  clients:    number;
}

export type GwMessage = BlockMsg | HealthMsg | AIMsg | PingMsg;

export interface RealtimeState {
  connected:    boolean;
  error:        string | null;
  latest:       GwMessage | null;
  blockByChain: Record<string, number>;
  healthByChain:Record<string, string>;
  ai:           Omit<AIMsg, 'type'> | null;
  serverTime:   string | null;
  gatewayClients: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const DEFAULT_URL =
  (typeof window !== 'undefined' ? window.__WS_GATEWAY_URL__ : undefined) ??
  process.env.NEXT_PUBLIC_WS_GATEWAY_URL ??
  'ws://localhost:8085';

declare global {
  interface Window { __WS_GATEWAY_URL__?: string }
}

export function useRealtime(url: string = DEFAULT_URL): RealtimeState {
  const [state, setState] = useState<RealtimeState>({
    connected:      false,
    error:          null,
    latest:         null,
    blockByChain:   {},
    healthByChain:  {},
    ai:             null,
    serverTime:     null,
    gatewayClients: 0,
  });

  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (typeof WebSocket === 'undefined') return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        retryDelay.current = 1000;
        setState(s => ({ ...s, connected: true, error: null }));
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setState(s => ({ ...s, connected: false }));
        // Exponential back-off, cap at 30 s
        const delay = Math.min(retryDelay.current, 30_000);
        retryDelay.current = Math.min(delay * 2, 30_000);
        retryRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        setState(s => ({ ...s, error: `ws-gateway unreachable at ${url}` }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        let msg: GwMessage;
        try {
          msg = JSON.parse(event.data as string) as GwMessage;
        } catch {
          return;
        }

        setState(prev => {
          const next = { ...prev, latest: msg };

          switch (msg.type) {
            case 'block':
              return {
                ...next,
                blockByChain: { ...prev.blockByChain, [msg.chain]: msg.blockNumber },
              };
            case 'health':
              return {
                ...next,
                healthByChain: { ...prev.healthByChain, [msg.chain]: msg.status },
              };
            case 'ai':
              return {
                ...next,
                ai: { alertLevel: msg.alertLevel, activeAgents: msg.activeAgents, anomaliesDetected24h: msg.anomaliesDetected24h },
              };
            case 'ping':
              return {
                ...next,
                serverTime:     msg.serverTime,
                gatewayClients: msg.clients,
              };
            default:
              return next;
          }
        });
      };
    } catch {
      setState(s => ({ ...s, error: 'WebSocket construction failed' }));
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return state;
}
