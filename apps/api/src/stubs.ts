import type { FeatureFlag, NetworkContext, ThemeMode } from '@ghostl/types';
import type { FeatureFlagsService, NetworkContextService, ThemeService } from './modules/app-shell/services';

export const createStubServices = () => {
  // App shell stubs
  const featureFlags: FeatureFlag[] = [
    { key: 'app-shell.command-palette', enabled: true, description: 'Enable command palette' },
    { key: 'observability.alerts', enabled: true, description: 'Alerts module' }
  ];

  const availableNetworks: NetworkContext[] = [
    { chainId: '31337', name: 'GhostL1', environment: 'local', rpcUrl: 'http://localhost:8545' },
    { chainId: '7192', name: 'GhostL2', environment: 'local', rpcUrl: 'http://localhost:9545' },
    { chainId: '7393', name: 'GhostL3', environment: 'local', rpcUrl: 'http://localhost:10545' }
  ];

  let currentNetwork: NetworkContext = availableNetworks[1];
  let themeMode: ThemeMode = 'system';

  const featureFlagsService: FeatureFlagsService = {
    async list() {
      return featureFlags;
    },
    async isEnabled(key: string) {
      return featureFlags.find((f) => f.key === key)?.enabled ?? false;
    },
    async setFlag(key: string, enabled: boolean) {
      const existing = featureFlags.find((f) => f.key === key);
      if (existing) {
        existing.enabled = enabled;
        return existing;
      }
      const created: FeatureFlag = { key, enabled };
      featureFlags.push(created);
      return created;
    }
  };

  const networkContextService: NetworkContextService = {
    async getCurrent() {
      return currentNetwork;
    },
    async setCurrent(ctx: NetworkContext) {
      currentNetwork = ctx;
      return currentNetwork;
    },
    async listAvailable() {
      return availableNetworks;
    }
  };

  const themeService: ThemeService = {
    async get() {
      return themeMode;
    },
    async set(mode: ThemeMode) {
      themeMode = mode;
    }
  };

  return {
    appShell: {
      featureFlags: featureFlagsService,
      networkContext: networkContextService,
      theme: themeService
    }
  };
};
