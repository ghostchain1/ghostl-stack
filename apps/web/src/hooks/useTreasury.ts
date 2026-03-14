'use client';

/**
 * useTreasury.ts — React hook for treasury data with live updates.
 */

import { useCallback, useEffect, useState } from 'react';
import type { TreasurySnapshot } from '../services/treasury';
import { fetchTreasurySnapshot } from '../services/treasury';
import { subscribeSSE, type SSEEvent } from '../services/sse-client';

export type TreasuryHook = {
  snapshot: TreasurySnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const POLL_INTERVAL_MS = 60_000;  // treasury updates less frequently

export function useTreasury(): TreasuryHook {
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchTreasurySnapshot();
      setSnapshot(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load treasury');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const unsub = subscribeSSE('/api/events?topics=treasury.update', (event: SSEEvent) => {
      if (event.type === 'treasury.update') void load();
    });

    const poll = setInterval(() => { void load(); }, POLL_INTERVAL_MS);

    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [load]);

  return { snapshot, loading, error, refresh: load };
}
