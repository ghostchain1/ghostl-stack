"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStubServices = void 0;
const nowIso = () => new Date().toISOString();
const createStubServices = () => {
    // App shell stubs
    const featureFlags = [
        { key: 'app-shell.command-palette', enabled: true, description: 'Enable command palette' },
        { key: 'observability.alerts', enabled: true, description: 'Alerts module' }
    ];
    const availableNetworks = [
        { chainId: '31337', name: 'GhostL1', environment: 'local', rpcUrl: 'http://localhost:8545' },
        { chainId: '7192', name: 'GhostL2', environment: 'local', rpcUrl: 'http://localhost:9545' },
        { chainId: '7393', name: 'GhostL3', environment: 'local', rpcUrl: 'http://localhost:10545' }
    ];
    let currentNetwork = availableNetworks[1];
    let themeMode = 'system';
    const featureFlagsService = {
        async list() {
            return featureFlags;
        },
        async isEnabled(key) {
            return featureFlags.find((f) => f.key === key)?.enabled ?? false;
        },
        async setFlag(key, enabled) {
            const existing = featureFlags.find((f) => f.key === key);
            if (existing) {
                existing.enabled = enabled;
                return existing;
            }
            const created = { key, enabled };
            featureFlags.push(created);
            return created;
        }
    };
    const networkContextService = {
        async getCurrent() {
            return currentNetwork;
        },
        async setCurrent(ctx) {
            currentNetwork = ctx;
            return currentNetwork;
        },
        async listAvailable() {
            return availableNetworks;
        }
    };
    const themeService = {
        async get() {
            return themeMode;
        },
        async set(mode) {
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
exports.createStubServices = createStubServices;
