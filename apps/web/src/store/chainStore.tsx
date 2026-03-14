'use client';

/**
 * chainStore.ts — Global chain state store using React Context.
 *
 * Wraps useChainStatus so data is fetched once at the top of the tree and
 * shared without prop drilling.  Components just call useChainStore().
 */

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import { useChainStatus, type ChainStatusHook } from '../hooks/useChainStatus';

const ChainStoreCtx = createContext<ChainStatusHook | null>(null);

export function ChainStoreProvider({ children }: { children: ReactNode }) {
  const store = useChainStatus();
  return (
    <ChainStoreCtx.Provider value={store}>
      {children}
    </ChainStoreCtx.Provider>
  );
}

export function useChainStore(): ChainStatusHook {
  const ctx = useContext(ChainStoreCtx);
  if (!ctx) throw new Error('useChainStore must be used inside ChainStoreProvider');
  return ctx;
}
