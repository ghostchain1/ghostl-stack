'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type FeatureFlags = Record<string, boolean>;

type FeatureFlagContextValue = {
  flags: FeatureFlags;
  isEnabled: (flag: string) => boolean;
  setFlag: (flag: string, enabled: boolean) => void;
};

const DEFAULT_FLAGS: FeatureFlags = {
  'ai.beta': true,
  'observability.grafana': true,
  'observability.alerts': true,
  'security.guardWrites': false,
  'ops.restart': true
};

const STORAGE_KEY = 'ghostl.featureFlags';

const parseEnvFlags = (raw?: string): FeatureFlags => {
  if (!raw) return {};
  return raw.split(/[;,]/).reduce<FeatureFlags>((acc, pair) => {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (!k) return acc;
    acc[k] = v === undefined ? true : v.toLowerCase() !== 'false';
    return acc;
  }, {});
};

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: DEFAULT_FLAGS,
  isEnabled: () => false,
  setFlag: () => undefined
});

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const seedFromEnv = useMemo(() => parseEnvFlags(process.env.NEXT_PUBLIC_FEATURE_FLAGS), []);
  const [flags, setFlags] = useState<FeatureFlags>({ ...DEFAULT_FLAGS, ...seedFromEnv });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFlags((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {
      // ignore
    }
  }, []);

  const setFlag = (flag: string, enabled: boolean) => {
    setFlags((prev) => {
      const next = { ...prev, [flag]: enabled };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const value: FeatureFlagContextValue = {
    flags,
    isEnabled: (flag) => Boolean(flags[flag]),
    setFlag
  };

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export const useFeatureFlags = () => useContext(FeatureFlagContext);
