/**
 * WalletContext — global Ghost Wallet state
 *
 * Provides:
 *   useWallet()  →  { provider, address, chainId, balance, connect, disconnect, isConnected, isGhostWallet }
 */
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type GhostWalletProvider,
  GHOST_CHAIN_L2_ID,
  formatGST,
  getAccounts,
  getBalance,
  getChainId,
  requestAccounts,
  resolveProvider,
  shortAddress,
  switchToGhostChain,
} from "../lib/ghostWallet";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WalletState {
  provider:      GhostWalletProvider | null;
  address:       string | null;
  chainId:       number | null;
  balance:       bigint;
  balanceStr:    string;
  shortAddr:     string;
  isConnected:   boolean;
  isGhostWallet: boolean;
  isCorrectChain: boolean;
  connecting:    boolean;
  error:         string | null;
}

interface WalletActions {
  connect:            () => Promise<void>;
  disconnect:         () => void;
  switchChain:        () => Promise<void>;
  clearError:         () => void;
}

type WalletContextValue = WalletState & WalletActions;

// ─── Context ─────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider]   = useState<GhostWalletProvider | null>(null);
  const [address, setAddress]     = useState<string | null>(null);
  const [chainId, setChainId]     = useState<number | null>(null);
  const [balance, setBalance]     = useState<bigint>(0n);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const providerRef = useRef<GhostWalletProvider | null>(null);

  // ── Refresh balance ─────────────────────────────────────────────────────
  const refreshBalance = useCallback(async (p: GhostWalletProvider, addr: string) => {
    try {
      const bal = await getBalance(p, addr);
      setBalance(bal);
    } catch { /* ignore */ }
  }, []);

  // ── Handle account changes ───────────────────────────────────────────────
  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accs = accounts as string[];
    if (!accs || accs.length === 0) {
      setAddress(null);
      setBalance(0n);
    } else {
      setAddress(accs[0]);
      if (providerRef.current) refreshBalance(providerRef.current, accs[0]);
    }
  }, [refreshBalance]);

  const handleChainChanged = useCallback((chainIdHex: unknown) => {
    setChainId(parseInt(chainIdHex as string, 16));
  }, []);

  // ── Connect ─────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const p = resolveProvider();
      if (!p) throw new Error("No wallet detected. Please install Ghost Wallet.");

      const accounts = await requestAccounts(p);
      const cid      = await getChainId(p);
      const addr     = accounts[0] ?? null;

      providerRef.current = p;
      setProvider(p);
      setAddress(addr);
      setChainId(cid);

      if (addr) await refreshBalance(p, addr);

      // Subscribe to events
      p.on("accountsChanged", handleAccountsChanged);
      p.on("chainChanged",    handleChainChanged);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [handleAccountsChanged, handleChainChanged, refreshBalance]);

  // ── Disconnect ──────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    const p = providerRef.current;
    if (p) {
      p.removeListener("accountsChanged", handleAccountsChanged);
      p.removeListener("chainChanged",    handleChainChanged);
    }
    providerRef.current = null;
    setProvider(null);
    setAddress(null);
    setChainId(null);
    setBalance(0n);
  }, [handleAccountsChanged, handleChainChanged]);

  // ── Switch chain ────────────────────────────────────────────────────────
  const switchChain = useCallback(async () => {
    if (!provider) return;
    try {
      await switchToGhostChain(provider);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }, [provider]);

  // ── Auto-connect if previously connected ────────────────────────────────
  useEffect(() => {
    const p = resolveProvider();
    if (!p) return;
    getAccounts(p).then((accounts) => {
      if (accounts.length > 0) connect();
    }).catch(() => {/* silent */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived state ──────────────────────────────────────────────────────
  const value = useMemo<WalletContextValue>(() => ({
    provider,
    address,
    chainId,
    balance,
    balanceStr:     formatGST(balance),
    shortAddr:      address ? shortAddress(address) : "",
    isConnected:    !!address,
    isGhostWallet:  !!provider?.isGhostWallet,
    isCorrectChain: chainId === GHOST_CHAIN_L2_ID,
    connecting,
    error,
    connect,
    disconnect,
    switchChain,
    clearError: () => setError(null),
  }), [provider, address, chainId, balance, connecting, error, connect, disconnect, switchChain]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
