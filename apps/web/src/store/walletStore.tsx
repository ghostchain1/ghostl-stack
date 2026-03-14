'use client';

/**
 * walletStore.ts — Global wallet / identity state store.
 *
 * Manages the currently active GhostWallet address and GNS name.
 * GhostWallet is the only supported wallet — no MetaMask / external wallets.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export interface WalletState {
  address: string | null;    // bech32 or hex
  gnsName: string | null;    // GNS (Ghost Name System) alias
  connected: boolean;
  layer: 'l1' | 'l2' | 'l3' | null;
  balanceGst: string | null;  // raw wei string, GST only
}

interface WalletStore extends WalletState {
  connect:    (address: string, gnsName?: string, layer?: 'l1' | 'l2' | 'l3') => void;
  disconnect: () => void;
  setBalance: (balanceGst: string) => void;
}

const DEFAULT_STATE: WalletState = {
  address:    null,
  gnsName:    null,
  connected:  false,
  layer:      null,
  balanceGst: null,
};

const WalletStoreCtx = createContext<WalletStore | null>(null);

export function WalletStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(DEFAULT_STATE);

  const connect = useCallback(
    (address: string, gnsName?: string, layer: 'l1' | 'l2' | 'l3' = 'l1') => {
      setState({ address, gnsName: gnsName ?? null, connected: true, layer, balanceGst: null });
    },
    [],
  );

  const disconnect = useCallback(() => setState(DEFAULT_STATE), []);

  const setBalance = useCallback(
    (balanceGst: string) => setState(prev => ({ ...prev, balanceGst })),
    [],
  );

  return (
    <WalletStoreCtx.Provider value={{ ...state, connect, disconnect, setBalance }}>
      {children}
    </WalletStoreCtx.Provider>
  );
}

export function useWalletStore(): WalletStore {
  const ctx = useContext(WalletStoreCtx);
  if (!ctx) throw new Error('useWalletStore must be used inside WalletStoreProvider');
  return ctx;
}
