'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type NetworkConfig = { id: string; label: string; env: string; rpc?: string; chainId?: number };

const DEFAULT_NETWORKS: NetworkConfig[] = [
  { id: 'l1', label: 'GhostChain L1', env: 'local', rpc: 'http://localhost:18545', chainId: 14000101 },
  { id: 'l2', label: 'GhostL2', env: 'local', rpc: 'http://localhost:18547', chainId: 901 },
  { id: 'l3', label: 'GhostL3', env: 'local', rpc: 'http://localhost:39545', chainId: 903 }
];

type NetworkContextValue = {
  networks: NetworkConfig[];
  current?: NetworkConfig;
  setNetwork: (id: string) => void;
};

const STORAGE_KEY = 'ghostl.network';

const NetworkContext = createContext<NetworkContextValue>({
  networks: DEFAULT_NETWORKS,
  current: DEFAULT_NETWORKS[1],
  setNetwork: () => undefined
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networks] = useState<NetworkConfig[]>(DEFAULT_NETWORKS);
  const [currentId, setCurrentId] = useState<string>(DEFAULT_NETWORKS[1].id);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCurrentId(stored);
    } catch {
      // ignore
    }
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
      setNetwork
    }),
    [networks, currentId]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export const useNetwork = () => useContext(NetworkContext);
