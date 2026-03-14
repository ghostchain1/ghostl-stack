'use client';

/**
 * validatorStore.tsx — React Context for live validator state.
 *
 * Backed by useValidators() (SSE + polling) and adds per-validator
 * performance data with a longer poll interval.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ValidatorSummary, ValidatorPerf } from '../services/validators';
import { fetchValidators, fetchValidatorPerf } from '../services/validators';

// ── State ─────────────────────────────────────────────────────────────────────

interface ValidatorState {
  validators:    ValidatorSummary[];
  perf:          ValidatorPerf[];
  loading:       boolean;
  error:         string | null;
  lastUpdated:   Date | null;
  refresh:       () => void;
}

const Ctx = createContext<ValidatorState | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ValidatorStoreProvider({ children }: { children: ReactNode }) {
  const [validators, setValidators] = useState<ValidatorSummary[]>([]);
  const [perf,       setPerf]       = useState<ValidatorPerf[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [vList, vPerf] = await Promise.all([
        fetchValidators(),
        fetchValidatorPerf(),
      ]);
      setValidators(vList);
      setPerf(vPerf);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'validator fetch failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => { void load(); }, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <Ctx.Provider value={{ validators, perf, loading, error, lastUpdated, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useValidatorStore(): ValidatorState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useValidatorStore must be inside ValidatorStoreProvider');
  return ctx;
}
