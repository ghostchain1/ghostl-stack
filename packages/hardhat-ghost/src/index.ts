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

import { extendEnvironment } from "hardhat/config";
import { lazyObject } from "hardhat/plugins";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { Signer, ContractFactory, BaseContract } from "ethers";
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
