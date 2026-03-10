'use client';

/**
 * index.tsx — Combined GhostStack store provider.
 *
 * Wrap the app once with <GhostStackStoreProvider> and all child components
 * can access any store via their respective hooks.
 *
 * Import order matters: AIStoreProvider depends on network data that is
 * independent of ChainStore, so the two can nest in any order.
 */

import type { ReactNode } from 'react';
import { ChainStoreProvider } from './chainStore';
import { WalletStoreProvider } from './walletStore';
import { AIStoreProvider } from './aiStore';
import { ValidatorStoreProvider } from './validatorStore';

export { useChainStore }     from './chainStore';
export { useWalletStore }    from './walletStore';
export { useAIStore }        from './aiStore';
export { useValidatorStore } from './validatorStore';

export function GhostStackStoreProvider({ children }: { children: ReactNode }) {
  return (
    <ChainStoreProvider>
      <WalletStoreProvider>
        <AIStoreProvider>
          <ValidatorStoreProvider>
            {children}
          </ValidatorStoreProvider>
        </AIStoreProvider>
      </WalletStoreProvider>
    </ChainStoreProvider>
  );
}
