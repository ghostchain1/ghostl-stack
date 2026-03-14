'use client';

/**
 * useAIRecommendations.ts — Hook for GhostBrain AI recommendation management.
 *
 * Surfaces pending recommendations and exposes approve / reject / auto-execute
 * actions.  All mutations go through the BFF and are then ratified by the
 * signing relay — no direct on-chain calls from the browser.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AIRecommendation, RecommendationStatus } from '../services/ai';
import {
  approveRecommendation,
  fetchAIRecommendations,
  rejectRecommendation,
} from '../services/ai';
import { subscribeSSE, type SSEEvent } from '../services/sse-client';

export type AIRecommendationsHook = {
  recommendations: AIRecommendation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  approve: (id: string) => Promise<void>;
  reject:  (id: string, reason?: string) => Promise<void>;
  mutating: Set<string>;  // IDs currently being actioned
};

export function useAIRecommendations(
  status: RecommendationStatus = 'pending',
): AIRecommendationsHook {
  const [recommendations, setRecs] = useState<AIRecommendation[]>([]);
  const [loading, setLoading]      = useState(true);
  const [error, setError]          = useState<string | null>(null);
  const [mutating, setMutating]    = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await fetchAIRecommendations(status);
      setRecs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load AI recommendations');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();

    const unsub = subscribeSSE('/api/events?topics=ai.recommendation', (event: SSEEvent) => {
      if (event.type === 'ai.recommendation') void load();
    });

    return unsub;
  }, [load]);

  const setMut = (id: string, active: boolean) =>
    setMutating(prev => {
      const next = new Set(prev);
      active ? next.add(id) : next.delete(id);
      return next;
    });

  const approve = useCallback(async (id: string) => {
    setMut(id, true);
    try {
      await approveRecommendation(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setMut(id, false);
    }
  }, [load]);

  const reject = useCallback(async (id: string, reason?: string) => {
    setMut(id, true);
    try {
      await rejectRecommendation(id, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setMut(id, false);
    }
  }, [load]);

  return { recommendations, loading, error, refresh: load, approve, reject, mutating };
}
