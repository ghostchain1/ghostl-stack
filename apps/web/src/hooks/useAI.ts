/**
 * useAI.ts — GhostBrain AI health and status hook.
 *
 * Lightweight hook (distinct from useAIRecommendations which handles the
 * full approve/reject workflow).  Use this for status panels and dashboards
 * that just need to know the current AI alert level and swarm health.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchSwarmStatus, fetchNetworkHealth } from '../services/ai';
import type { AISwarmStatus, AINetworkHealth } from '../services/ai';

export interface AIStatusState {
  swarm:         AISwarmStatus | null;
  networkHealth: AINetworkHealth | null;
  alertLevel:    'green' | 'yellow' | 'red';
  loading:       boolean;
  error:         string | null;
  lastUpdated:   Date | null;
}

/**
 * Poll GhostBrain swarm + network health every `intervalMs` (default 20 s).
 * The alert level is derived from `networkHealth.status`.
 */
export function useAI(intervalMs = 20_000): AIStatusState {
  const [swarm,         setSwarm]         = useState<AISwarmStatus | null>(null);
  const [networkHealth, setNetworkHealth] = useState<AINetworkHealth | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [sw, nh] = await Promise.all([fetchSwarmStatus(), fetchNetworkHealth()]);
      setSwarm(sw);
      setNetworkHealth(nh);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI status fetch failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => { void load(); }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);

  // Derive alert level from network health alertLevel field
  const alertLevel: 'green' | 'yellow' | 'red' =
    !networkHealth ? 'green' : networkHealth.alertLevel ?? 'green';

  return { swarm, networkHealth, alertLevel, loading, error, lastUpdated };
}
