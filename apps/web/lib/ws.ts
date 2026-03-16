/**
 * lib/ws.ts — GhostStack WebSocket gateway module.
 *
 * Re-exports the fully-featured `useRealtime` hook and its companion types.
 * Components that need live block / health / AI data should import from here.
 *
 * Gateway URL resolution order:
 *   1. window.__WS_GATEWAY_URL__ (runtime injection)
 *   2. NEXT_PUBLIC_WS_GATEWAY_URL env (build-time)
 *   3. ws://localhost:8085 (local fallback)
 *
 * Usage:
 *   import { useRealtime, type BlockMsg } from '@/lib/ws';
 *   const { connected, blockByChain, ai } = useRealtime();
 */

export {
  useRealtime,
  type RealtimeState,
  type BlockMsg,
  type HealthMsg,
  type AIMsg,
  type PingMsg,
  type GwMessage,
} from '../src/hooks/useRealtime';
