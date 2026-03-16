import type { FeatureFlag, NetworkContext, ThemeMode } from '@ghostchain/types';
import type { FeatureFlagsService, NetworkContextService, ThemeService } from './modules/app-shell/services';
import { ghostWalletRpcManager } from './services/rpc-manager';

export const createStubServices = () => {
  // App shell stubs
  const featureFlags: FeatureFlag[] = [
    { key: 'app-shell.command-palette', enabled: true, description: 'Enable command palette' },
    { key: 'observability.alerts', enabled: true, description: 'Alerts module' }
  ];

  const buildNetworks = (): NetworkContext[] => {
    const pool = ghostWalletRpcManager.getPoolSnapshot();
    const layers: Array<{ id: 'L1' | 'L2' | 'L3'; name: string; fallbackChainId: string }> = [
      { id: 'L1', name: 'GhostChain L1', fallbackChainId: '14000101' },
      { id: 'L2', name: 'GhostL2', fallbackChainId: '901' },
      { id: 'L3', name: 'GhostL3', fallbackChainId: '903' }
    ];
    return layers.map((layer) => {
      const endpoints = pool[layer.id] || [];
      const primary = endpoints.find((endpoint) => endpoint.protocol === 'http') || endpoints[0];
      return {
        chainId: primary?.chainId ? String(primary.chainId) : layer.fallbackChainId,
        name: layer.name,
        environment: 'local',
        rpcUrl: primary?.url || ''
      };
    });
  };

  let currentNetwork: NetworkContext = buildNetworks().find((n) => n.name === 'GhostL2') || buildNetworks()[0];
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
      if (!currentNetwork.rpcUrl) {
        const refreshed = buildNetworks();
        const fallback = refreshed.find((n) => n.name === currentNetwork.name) || refreshed[0];
        if (fallback) currentNetwork = fallback;
      }
      return currentNetwork;
    },
    async setCurrent(ctx: NetworkContext) {
      currentNetwork = ctx;
      return currentNetwork;
    },
    async listAvailable() {
      return buildNetworks();
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
