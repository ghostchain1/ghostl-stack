'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveApiBase } from '../../../lib/runtime';

export type NetworkConfig = { id: string; label: string; env: string; rpc?: string; chainId?: number };

type RpcEndpoint = { url: string; protocol?: string };
type RpcPoolResponse = { pool?: { L1?: RpcEndpoint[]; L2?: RpcEndpoint[]; L3?: RpcEndpoint[] } };

const envLabel = process.env.NEXT_PUBLIC_ENV || 'local';
const DEFAULT_NETWORKS: NetworkConfig[] = [
  {
    id: 'l1',
    label: 'GhostChain L1',
    env: envLabel,
    rpc: process.env.NEXT_PUBLIC_L1_RPC || 'http://localhost:18545',
    chainId: Number(process.env.NEXT_PUBLIC_L1_CHAIN_ID || 14000101)
  },
  {
    id: 'l2',
    label: 'GhostL2',
    env: envLabel,
    rpc: process.env.NEXT_PUBLIC_L2_RPC || 'http://localhost:18547',
    chainId: Number(process.env.NEXT_PUBLIC_L2_CHAIN_ID || 901)
  },
  {
    id: 'l3',
    label: 'GhostL3',
    env: envLabel,
    rpc: process.env.NEXT_PUBLIC_L3_RPC || 'http://localhost:39545',
    chainId: Number(process.env.NEXT_PUBLIC_L3_CHAIN_ID || 903)
  }
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
  const [networks, setNetworks] = useState<NetworkConfig[]>(DEFAULT_NETWORKS);
  const [currentId, setCurrentId] = useState<string>(DEFAULT_NETWORKS[1].id);

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
        const res = await fetch(`${resolveApiBase()}/rpc/pool`, { credentials: 'include' });
        if (!res.ok) return;
        const data = (await res.json()) as RpcPoolResponse;
        if (!data.pool) return;
        const pickUrl = (list?: RpcEndpoint[]) =>
          list?.find((endpoint) => endpoint.protocol !== 'ws')?.url || list?.[0]?.url || '';
        const updated = DEFAULT_NETWORKS.map((network) => {
          const poolKey = network.id === 'l1' ? 'L1' : network.id === 'l2' ? 'L2' : 'L3';
          const rpc = pickUrl(data.pool?.[poolKey]) || network.rpc;
          return { ...network, rpc };
        });
        if (active) setNetworks(updated);
      } catch {
        // ignore
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
      setNetwork
    }),
    [networks, currentId]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export const useNetwork = () => useContext(NetworkContext);
