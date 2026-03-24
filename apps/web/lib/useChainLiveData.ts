/**
 * useChainLiveData — shared multi-layer chain polling hook
 *
 * Polls /api/chains/{layer} every 8s for all three layers simultaneously
 * and returns aggregated data for use in any dashboard component.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface LayerSnapshot {
  layer: string;
  chainId: number;
  label: string;
  blockNumber: number | null;
  gasPriceGwei: number | null;
  peers: number | null;
  ok: boolean;
  rollupType?: string;
  settlementLayer?: string;
  consensus?: string;
  activeValidators?: number | null;
  tps?: number | null;
  error?: string;
}

export interface ChainLiveData {
  l1: LayerSnapshot | null;
  l2: LayerSnapshot | null;
  l3: LayerSnapshot | null;
  loading: boolean;
  lastRefresh: Date | null;
  allHealthy: boolean;
  refresh: () => void;
}

const POLL_MS = 8_000;
const LAYERS = ['l1', 'l2', 'l3'] as const;
type LayerKey = typeof LAYERS[number];

export function useChainLiveData(): ChainLiveData {
  const [data, setData] = useState<Record<LayerKey, LayerSnapshot | null>>({ l1: null, l2: null, l3: null });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled(
      LAYERS.map(layer =>
        fetch(`/api/chains/${layer}`, { cache: 'no-store' })
          .then(r => r.ok ? (r.json() as Promise<LayerSnapshot>) : null)
          .catch(() => null)
      )
    );
    const next: Record<LayerKey, LayerSnapshot | null> = { l1: null, l2: null, l3: null };
    results.forEach((res, i) => {
      const layer = LAYERS[i];
      next[layer] = res.status === 'fulfilled' ? res.value : null;
    });
    setData(next);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    timerRef.current = setInterval(() => { void fetchAll(); }, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  const allHealthy = LAYERS.every(l => data[l]?.ok === true);

  return {
    l1: data.l1,
    l2: data.l2,
    l3: data.l3,
    loading,
    lastRefresh,
    allHealthy,
    refresh: () => { void fetchAll(); },
  };
}

/**
 * useServiceHealth — polls /api/status/services every 15s
 */
export interface ServiceHealth {
  name: string;
  port?: number;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  latencyMs?: number;
  category?: string;
}

export function useServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/status/services', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json() as { services?: ServiceHealth[] } | ServiceHealth[];
        setServices(Array.isArray(d) ? d : (d.services ?? []));
      }
    } catch {/* ignore */}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const healthy = services.filter(s => s.status === 'up').length;
  const unhealthy = services.filter(s => s.status === 'down').length;
  return { services, loading, healthy, unhealthy, total: services.length };
}

/**
 * useGhostBrainStatus — polls GhostBrain Core health  port 7900
 */
export function useGhostBrainStatus() {
  const [status, setStatus] = useState<{ ok: boolean; agents?: number; cycleCount?: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/ai/health', { cache: 'no-store' });
        if (res.ok) setStatus(await res.json());
      } catch {/* ignore */}
    };
    void load();
    const t = setInterval(() => { void load(); }, 20_000);
    return () => clearInterval(t);
  }, []);

  return status;
}
