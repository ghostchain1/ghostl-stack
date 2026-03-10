'use client';

/**
 * aiStore.ts — Global AI / GhostBrain state store.
 *
 * Tracks live swarm status, alert level, and the queue of pending AI
 * recommendations that require human ratification.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AIRecommendation, AISwarmStatus, AINetworkHealth } from '../services/ai';
import { fetchSwarmStatus, fetchNetworkHealth, fetchAIRecommendations } from '../services/ai';
import { subscribeSSE, type SSEEvent } from '../services/sse-client';

export interface AIStoreState {
  swarm: AISwarmStatus | null;
  networkHealth: AINetworkHealth | null;
  pendingRecs: AIRecommendation[];
  alertLevel: 'green' | 'yellow' | 'red';
  loading: boolean;
  error: string | null;
}

interface AIStore extends AIStoreState {
  refresh: () => void;
}

const AIStoreCtx = createContext<AIStore | null>(null);

const POLL_MS = 30_000;

export function AIStoreProvider({ children }: { children: ReactNode }) {
  const [swarm, setSwarm]               = useState<AISwarmStatus | null>(null);
  const [networkHealth, setHealth]      = useState<AINetworkHealth | null>(null);
  const [pendingRecs, setPendingRecs]   = useState<AIRecommendation[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, h, recs] = await Promise.all([
        fetchSwarmStatus(),
        fetchNetworkHealth(),
        fetchAIRecommendations('pending'),
      ]);
      setSwarm(s);
      setHealth(h);
      setPendingRecs(recs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI store load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const unsub = subscribeSSE('/api/events?topics=ai.recommendation,ai.swarm', (event: SSEEvent) => {
      if (event.type === 'ai.recommendation' || event.type === 'ai.swarm') void load();
    });

    const poll = setInterval(() => { void load(); }, POLL_MS);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [load]);

  const alertLevel = networkHealth?.alertLevel ?? 'green';

  return (
    <AIStoreCtx.Provider
      value={{ swarm, networkHealth, pendingRecs, alertLevel, loading, error, refresh: load }}
    >
      {children}
    </AIStoreCtx.Provider>
  );
}

export function useAIStore(): AIStore {
  const ctx = useContext(AIStoreCtx);
  if (!ctx) throw new Error('useAIStore must be used inside AIStoreProvider');
  return ctx;
}
