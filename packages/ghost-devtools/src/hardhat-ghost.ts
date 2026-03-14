/**
 * GhostHardhatPlugin — injects GhostSDK into the Hardhat Environment.
 * Replaces hre.ethers entirely with hre.ghost.
 *
 * Usage in hardhat.config.ts:
 *   import "@ghoststack/ghost-devtools"
 */
import { extendEnvironment, extendConfig } from "hardhat/config";
import { GhostProvider, GhostWallet, GhostContract, GhostGasEngine } from "@ghoststack/ghost-sdk";

extendEnvironment((hre: any) => {
  hre.ghost = {
    provider(url: string): GhostProvider {
      return new GhostProvider(url);
    },

    wallet(privateKey: string, provider: GhostProvider): GhostWallet {
      return new GhostWallet(privateKey, provider);
    },

    contract(address: string, abi: unknown[], provider: GhostProvider): GhostContract {
      return new GhostContract(address, abi, provider);
    },

    gasEngine: GhostGasEngine,

    /**
     * Returns a GhostProvider connected to the currently selected Hardhat Ghost network.
     */
    defaultProvider(): GhostProvider {
      const networkConfig = hre.network.config as any;
      const url: string = networkConfig?.url ?? "http://127.0.0.1:8545";
      return new GhostProvider(url);
    },
  };
});

extendConfig((config: any) => {
  // Ensure ghost_ RPC namespace is used in all network configs
  const networks = config.networks ?? {};
  for (const [, netConfig] of Object.entries(networks)) {
    const nc = netConfig as any;
    if (nc && !nc.ghostNative) {
      nc.ghostNative = true;
    }
  }
});
