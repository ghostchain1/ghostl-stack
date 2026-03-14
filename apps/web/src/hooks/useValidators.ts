'use client';

/**
 * useValidators.ts — React hook for validator set data with live updates.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ValidatorList } from '../modules/command-center/services/validator-api';
import { fetchValidators } from '../modules/command-center/services/validator-api';
import { subscribeSSE, type SSEEvent } from '../services/sse-client';

export type ValidatorsHook = {
  data: ValidatorList | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const POLL_INTERVAL_MS = 30_000;

export function useValidators(): ValidatorsHook {
  const [data, setData]       = useState<ValidatorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchValidators();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load validators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const unsub = subscribeSSE('/api/events?topics=validator.update', (event: SSEEvent) => {
      if (event.type === 'validator.update') void load();
    });

    const poll = setInterval(() => { void load(); }, POLL_INTERVAL_MS);

    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [load]);

  return { data, loading, error, refresh: load };
}
