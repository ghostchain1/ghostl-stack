'use client';

import type { ReactNode } from 'react';
import { FeatureFlagsProvider } from './services/FeatureFlagsService';
import { NetworkProvider } from './services/NetworkContextService';
import { ThemeProvider } from './services/ThemeService';

export function AppShellProvider({ children }: { children: ReactNode }) {
  return (
    <FeatureFlagsProvider>
      <NetworkProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </NetworkProvider>
    </FeatureFlagsProvider>
  );
}
