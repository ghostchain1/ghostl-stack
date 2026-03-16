'use client';

/**
 * store/useStore.ts — Unified GhostStack store selector hook.
 *
 * Aggregates all React-Context stores so components can access a single
 * snapshot of chain, wallet, AI, and validator state without importing
 * four separate hooks.
 *
 * Usage:
 *   const s = useGhostStore();
 *   s.chain.status?.l1.blockNumber
 *   s.wallet.address
 *   s.ai.alertLevel
 */

import { useChainStore }     from '../src/store/chainStore';
import { useWalletStore }    from '../src/store/walletStore';
import { useAIStore }        from '../src/store/aiStore';
import { useValidatorStore } from '../src/store/validatorStore';

export type GhostStore = ReturnType<typeof useGhostStore>;

export function useGhostStore() {
  const chain     = useChainStore();
  const wallet    = useWalletStore();
  const ai        = useAIStore();
  const validator = useValidatorStore();

  return { chain, wallet, ai, validator } as const;
}

// Re-export individual stores for convenience
export { useChainStore, useWalletStore, useAIStore, useValidatorStore };
