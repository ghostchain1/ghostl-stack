'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChainOverviewSchema, type ChainOverview } from '@ghostl/contract-schemas';
import { resolveApiBase } from '../../../lib/runtime';
import { apiRequest, type ApiError } from '../../../lib/api';

export type NetworkConfig = { id: string; label: string; env: string; rpc?: string; chainId?: number };

const envLabel = process.env.NEXT_PUBLIC_ENV || 'local';
const DEFAULT_NETWORKS: NetworkConfig[] = [
  {
    id: 'l1',
    label: 'GhostChain L1',
    env: envLabel
  },
  {
    id: 'l2',
    label: 'GhostL2',
    env: envLabel
  },
  {
    id: 'l3',
    label: 'GhostL3',
    env: envLabel
  }
];

type NetworkContextValue = {
  networks: NetworkConfig[];
  current?: NetworkConfig;
  setNetwork: (id: string) => void;
  error?: ApiError;
};

const STORAGE_KEY = 'ghostl.network';

const NetworkContext = createContext<NetworkContextValue>({
  networks: DEFAULT_NETWORKS,
  current: DEFAULT_NETWORKS[1],
  setNetwork: () => undefined
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networks, setNetworks] = useState<NetworkConfig[]>(DEFAULT_NETWORKS);
  const [currentId, setCurrentId] = useState<string>(DEFAULT_NETWORKS[1].id);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCurrentId(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadPool = async () => {
      try {
        const res = await apiRequest<ChainOverview>('/chain', { baseUrl: resolveApiBase(), schema: ChainOverviewSchema });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const updated = DEFAULT_NETWORKS.map((network) => {
          const snapshot = res.data.chains.find((chain) => chain.id === network.id);
          const chainId = snapshot?.rpc?.chainId ?? (snapshot?.info?.chainId ? Number(snapshot.info.chainId) : undefined);
          return {
            ...network,
            env: snapshot?.info?.env || network.env,
            rpc: snapshot?.rpc?.url,
            chainId: Number.isFinite(chainId) ? chainId : undefined
          };
        });
        if (active) setNetworks(updated);
        setError(null);
      } catch {
        setError({
          message: 'chain_overview_fetch_failed',
          endpoint: `${resolveApiBase()}/chain`,
          method: 'GET',
          hint: 'Check ghost-api /chain endpoint and ensure ghost-registry is healthy.'
        });
      }
    };

    loadPool();
    return () => {
      active = false;
    };
  }, []);

  const setNetwork = (id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const value: NetworkContextValue = useMemo(
    () => ({
      networks,
      current: networks.find((n) => n.id === currentId) || networks[0],
      setNetwork,
      error: error || undefined
    }),
    [networks, currentId, error]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export const useNetwork = () => useContext(NetworkContext);
