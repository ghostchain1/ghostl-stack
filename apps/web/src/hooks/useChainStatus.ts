'use client';

/**
 * useChainStatus.ts — React hook for real-time chain status across L1/L2/L3.
 *
 * Polls the BFF on mount, then upgrades to SSE for live updates.
 * Falls back to polling on SSE failure without crashing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChainStatusAll, ChainLayer } from '../services/ghostchain';
import { fetchAllChainStatus } from '../services/ghostchain';
import { subscribeSSE, type SSEEvent } from '../services/sse-client';

export type ChainStatusHook = {
  status: ChainStatusAll | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  lastUpdated: Date | null;
};

const POLL_INTERVAL_MS  = 15_000;  // fallback polling every 15 s
const SSE_URL           = '/api/events?topics=chain.health,chain.block,chain.gas';

export function useChainStatus(): ChainStatusHook {
  const [status, setStatus]           = useState<ChainStatusAll | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllChainStatus();
      setStatus(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chain status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // SSE real-time updates
    const unsub = subscribeSSE(SSE_URL, (event: SSEEvent) => {
      if (
        event.type === 'chain.health' ||
        event.type === 'chain.block' ||
        event.type === 'chain.gas'
      ) {
        void load();  // re-fetch full status on any chain event
      }
    });

    // Fallback polling
    pollRef.current = setInterval(() => { void load(); }, POLL_INTERVAL_MS);

    return () => {
      unsub();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  return { status, loading, error, refresh: load, lastUpdated };
}

/** Convenience: status for a single layer. */
export function useLayerStatus(layer: ChainLayer) {
  const { status, loading, error, refresh, lastUpdated } = useChainStatus();
  return {
    layerStatus: status?.[layer] ?? null,
    loading,
    error,
    refresh,
    lastUpdated,
  };
}
