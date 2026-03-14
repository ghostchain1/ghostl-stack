/**
 * hardhat-ghost
 *
 * Hardhat plugin that injects the `ghost` SDK namespace into the Hardhat
 * Runtime Environment (HRE), letting scripts use:
 *
 *   import { ghost } from "hardhat";
 *
 *   const [deployer] = await ghost.getSigners();
 *   const token = await ghost.getContractAt("GhostToken", address);
 *   const cost  = ghost.parseGhost("1.5");   // 1.5 GST in GhostWei
 *
 * The plugin wraps hardhat-ethers internally so there is zero duplication
 * of RPC logic — Ghost is the public API, ethers stays the private engine.
 */

import { extendEnvironment, task } from "hardhat/config";
import { lazyObject } from "hardhat/plugins";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { Signer, ContractFactory, BaseContract } from "@ghostchain/sdk";
import {
  ghost as ghostSdk,
  parseGhost,
  formatGhost,
  parseGhostGwei,
  formatGhostGwei,
  GhostUnits,
  GhostGasEngine,
  JsonRpcProvider as GhostJsonRpcProvider,
  GhostWallet,
  GhostNetworks,
} from "@ghostchain/sdk";

// ── HRE type augmentation ─────────────────────────────────────────────────────

declare module "hardhat/types" {
  interface HardhatRuntimeEnvironment {
    /**
     * The Ghost SDK namespace — replaces `hre.ethers`.
     *
     * All ethers HRE helpers are exposed under Ghost branding:
     *   ghost.getSigners()          → ethers.getSigners()
     *   ghost.getContractAt(…)      → ethers.getContractAt(…)
     *   ghost.getContractFactory(…) → ethers.getContractFactory(…)
     *   ghost.getContract(…)        → ethers.getContractAt(…) alias
     */
    ghost: GhostHre;
  }
}

export interface GhostHre {
  // ── Hardhat-ethers bindings ─────────────────────────────────────────────
  /** Returns the list of unlocked signers from the Hardhat node. */
  getSigners(): Promise<Signer[]>;
  /** Return a specific signer by address. */
  getSigner(address: string): Promise<Signer>;
  /** Deploy-ready ContractFactory for a named artifact. */
  getContractFactory(name: string, signer?: Signer): Promise<ContractFactory>;
  /** ContractFactory from ABI + bytecode. */
  getContractFactoryFromArtifact(
    artifact: { abi: unknown[]; bytecode: string },
    signer?: Signer
  ): Promise<ContractFactory>;
  /** Attach to a deployed contract by artifact name + address. */
  getContractAt(name: string, address: string, signer?: Signer): Promise<BaseContract>;
  /**
   * Alias for `getContractAt` — Ghost idiomatic name.
   *
   * @example
   *   const token = await ghost.getContract("GhostToken", tokenAddress);
   */
  getContract(name: string, address: string, signer?: Signer): Promise<BaseContract>;

  // ── Ghost unit utils ────────────────────────────────────────────────────
  /** Parse a human-readable Ghost amount to GhostWei. */
  parseGhost: typeof parseGhost;
  /** Format GhostWei to a human-readable Ghost string. */
  formatGhost: typeof formatGhost;
  /** Parse a GhostGwei string to GhostWei. */
  parseGhostGwei: typeof parseGhostGwei;
  /** Format GhostWei to a GhostGwei string. */
  formatGhostGwei: typeof formatGhostGwei;
  /** Ghost unit constants and helpers namespace. */
  units: typeof GhostUnits;
  /** Gas fee oracle. */
  GasEngine: typeof GhostGasEngine;

  // ── Ghost SDK re-exports ────────────────────────────────────────────────
  JsonRpcProvider: typeof GhostJsonRpcProvider;
  Wallet: typeof GhostWallet;
  Networks: typeof GhostNetworks;

  // ── Forward the rest of the ghost SDK namespace ─────────────────────────
  provider: typeof ghostSdk;
}

// ── Plugin registration ────────────────────────────────────────────────────

extendEnvironment((hre: HardhatRuntimeEnvironment) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const he = (hre as unknown as Record<string, unknown>)["ethers"] as any;

  hre.ghost = lazyObject(() => ({
    // Delegate to hardhat-ethers for test node integration
    getSigners: ()                           => he.getSigners(),
    getSigner:  (address: string)            => he.getSigner(address),
    getContractFactory: (name: string, signer?: Signer) =>
      he.getContractFactory(name, signer),
    getContractFactoryFromArtifact: (
      artifact: { abi: unknown[]; bytecode: string },
      signer?: Signer
    ) => he.getContractFactoryFromArtifact(artifact, signer),
    getContractAt: (name: string, address: string, signer?: Signer) =>
      he.getContractAt(name, address, signer),
    getContract: (name: string, address: string, signer?: Signer) =>
      he.getContractAt(name, address, signer),

    // Ghost unit system
    parseGhost,
    formatGhost,
    parseGhostGwei,
    formatGhostGwei,
    units:     GhostUnits,
    GasEngine: GhostGasEngine,

    // Ghost SDK classes
    JsonRpcProvider: GhostJsonRpcProvider,
    Wallet:          GhostWallet,
    Networks:        GhostNetworks,

    // The full SDK object for advanced usage
    provider: ghostSdk,
  }));
});

// ── ghost:generate task ────────────────────────────────────────────────────────
//
// Generates a GhostChain smart contract from a template and writes the
// Solidity source (and optionally a deploy script) to the contracts tree.
//
// Usage (from the contracts/ directory):
//
//   npx hardhat ghost:generate --type token  --name MyToken    --symbol MTK
//   npx hardhat ghost:generate --type nft    --name GhostBadge --symbol GBDG
//   npx hardhat ghost:generate --type staking --name MyStaking
//   npx hardhat ghost:generate --type dao    --name MyCouncil
//   npx hardhat ghost:generate --type dex    --name GhostX      --no-deploy
//

task("ghost:generate", "Generate a GhostChain Solidity contract from a template")
  .addOption({ name: "type",      description: "Contract type: token | nft | staking | dao | dex", defaultValue: "" })
  .addOption({ name: "name",      description: "PascalCase contract name, e.g. GhostGovToken", defaultValue: "" })
  .addOption({ name: "symbol",    description: "Token/NFT symbol (for token and nft types)", defaultValue: "" })
  .addOption({ name: "outDir",    description: "Output directory inside contracts/src/", defaultValue: "generated" })
  .addOption({ name: "maxSupply", description: "Maximum total supply in whole tokens (token type only)", defaultValue: "" })
  .addFlag({ name: "noDeploy",    description: "Skip generating a Hardhat deploy script" })
  .addFlag({ name: "emitSdk",     description: "Also emit a TypeScript SDK wrapper stub" })
  .setInlineAction(async (args, _hre) => {
    // Lazy-load ghost-contract-factory so the plugin itself has no hard dep.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let factory: any;
    try {
      factory = await import("@ghostchain/ghost-contract-factory");
    } catch {
      throw new Error(
        "[hardhat-ghost] ghost:generate requires @ghostchain/ghost-contract-factory. " +
        "Run: npm install @ghostchain/ghost-contract-factory"
      );
    }

    const { generateContract } = factory as {
      generateContract: (input: {
        type: string;
        name: string;
        options?: Record<string, unknown>;
        outDir?: string;
        emitDeployScript?: boolean;
        emitSdkWrapper?: boolean;
      }) => {
        solidity: { path: string; content: string } | Array<{ path: string; content: string }>;
        deployScript?: { path: string; content: string };
        sdkWrapper?:   { path: string; content: string };
      };
    };

    const typeLower = (args.type as string).toLowerCase();
    const nameVal   = args.name as string;

    if (!/^[A-Z][A-Za-z0-9]+$/.test(nameVal)) {
      throw new Error(
        `[ghost:generate] --name must be PascalCase (e.g. GhostGovToken). Got: "${nameVal}"`
      );
    }

    const options: Record<string, unknown> = {};
    if (args.symbol)    options["symbol"]    = args.symbol;
    if (args.maxSupply) options["maxSupply"] = args.maxSupply;

    console.log(`[ghost:generate] type=${typeLower}  name=${nameVal}`);

    const result = generateContract({
      type:             typeLower as "token" | "nft" | "staking" | "dao" | "dex",
      name:             nameVal,
      options,
      outDir:           `contracts/src/${args.outDir as string}`,
      emitDeployScript: !(args.noDeploy as boolean),
      emitSdkWrapper:   args.emitSdk   as boolean,
    });

    const { writeFileSync, mkdirSync } = await import("fs");
    const { dirname, resolve }         = await import("path");

    // Write Solidity file(s)
    const solFiles = Array.isArray(result.solidity) ? result.solidity : [result.solidity];
    for (const f of solFiles) {
      const abs = resolve(f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content, "utf8");
      console.log(`[ghost:generate] Written: ${f.path}`);
    }

    // Write deploy script
    if (result.deployScript) {
      const abs = resolve(result.deployScript.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, result.deployScript.content, "utf8");
      console.log(`[ghost:generate] Deploy:  ${result.deployScript.path}`);
    }

    // Write SDK wrapper
    if (result.sdkWrapper) {
      const abs = resolve(result.sdkWrapper.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, result.sdkWrapper.content, "utf8");
      console.log(`[ghost:generate] SDK:     ${result.sdkWrapper.path}`);
    }

    console.log("[ghost:generate] Done. Run `forge build` to compile.");
  });
