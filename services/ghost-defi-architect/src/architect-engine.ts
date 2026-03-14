/**
 * architect-engine.ts — GhostChain Autonomous DeFi System Orchestrator.
 *
 * `buildDeFiSystem(config)` coordinates all module engines and returns a
 * complete `DeFiSystemOutput` ready for filesystem writes.
 *
 * Modules invoked (each is optional — omit by leaving config section undefined):
 *   amm         → GhostXchangePair + Factory + Router
 *   liquidity   → LP pool sizing + optional YieldFarm for LP incentives
 *   staking     → Single-asset staking + APY model
 *   yield       → LP yield farming contract
 *   treasury    → TreasuryBuyback contract + buyback simulation
 *   tokenomics  → Emission schedule + supply projection (no Solidity)
 *   bridge      → Cross-layer routing config (no Solidity)
 */

import { designAmm,        type AmmConfig,        type AmmDesignOutput    } from "./modules/amm-engine.js";
import { designLiquidity,  type LiquidityConfig,  type LiquidityDesignOutput } from "./modules/liquidity-engine.js";
import { designStaking,    type StakingConfig,    type StakingDesignOutput } from "./modules/staking-engine.js";
import { designYield,      type YieldConfig,      type YieldDesignOutput   } from "./modules/yield-engine.js";
import { designTreasury,   type TreasuryConfig,   type TreasuryDesignOutput } from "./modules/treasury-engine.js";
import { designTokenomics, type TokenomicsConfig, type TokenomicsDesign    } from "./modules/tokenomics-engine.js";
import { designBridge,     type BridgeConfig,     type BridgeDesignOutput  } from "./modules/bridge-engine.js";
import type { GeneratedFile } from "@ghostchain/ghost-contract-factory";

// ── System config ─────────────────────────────────────────────────────────────

export interface DeFiSystemConfig {
  /** Shared project name across all modules */
  projectName: string;
  /** Whether to emit deploy scripts for generated contracts */
  emitDeploy?: boolean;
  /** Whether to emit TypeScript SDK wrappers */
  emitSdk?: boolean;
  /** If omitted, AMM is not generated */
  amm?: Omit<AmmConfig, "projectName" | "emitDeploy" | "emitSdk">;
  /** If omitted, LP pool sizing is skipped */
  liquidity?: Omit<LiquidityConfig, "projectName" | "emitDeploy" | "emitSdk">;
  /** If omitted, staking is not generated */
  staking?: Omit<StakingConfig, "projectName" | "emitDeploy" | "emitSdk">;
  /** If omitted, yield farming is not generated */
  yield?: Omit<YieldConfig, "projectName" | "emitDeploy" | "emitSdk">;
  /** If omitted, treasury buyback is not generated */
  treasury?: Omit<TreasuryConfig, "projectName" | "emitDeploy" | "emitSdk">;
  /** If omitted, tokenomics projection is skipped */
  tokenomics?: Omit<TokenomicsConfig, never>;
  /** If omitted, bridge routing config is skipped */
  bridge?: Omit<BridgeConfig, "projectName">;
}

// ── System output ─────────────────────────────────────────────────────────────

export interface DeFiSystemOutput {
  /** All generated Solidity files (and any deploy scripts / SDK wrappers) */
  files: GeneratedFile[];
  /** Per-module results for introspection */
  modules: {
    amm?:        AmmDesignOutput;
    liquidity?:  LiquidityDesignOutput;
    staking?:    StakingDesignOutput;
    yield?:      YieldDesignOutput;
    treasury?:   TreasuryDesignOutput;
    tokenomics?: TokenomicsDesign;
    bridge?:     BridgeDesignOutput;
  };
  stats: DeFiSystemStats;
}

export interface DeFiSystemStats {
  projectName:    string;
  modulesInvoked: string[];
  filesGenerated: number;
  contractsGenerated: number;
  timestamp:      string;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export function buildDeFiSystem(config: DeFiSystemConfig): DeFiSystemOutput {
  const allFiles: GeneratedFile[] = [];
  const modulesInvoked: string[] = [];
  const modules: DeFiSystemOutput["modules"] = {};

  const emitDeploy = config.emitDeploy ?? true;
  const emitSdk    = config.emitSdk    ?? false;

  // ── AMM ──────────────────────────────────────────────────────────────────
  if (config.amm !== undefined) {
    const out = designAmm({
      ...config.amm,
      projectName: config.projectName,
      emitDeploy,
      emitSdk,
    });
    modules.amm = out;
    allFiles.push(...out.files);
    modulesInvoked.push("amm");
  }

  // ── Liquidity ─────────────────────────────────────────────────────────────
  if (config.liquidity !== undefined) {
    const out = designLiquidity({
      ...config.liquidity,
      projectName: config.projectName,
      emitDeploy,
      emitSdk,
    });
    modules.liquidity = out;
    allFiles.push(...out.files);
    modulesInvoked.push("liquidity");
  }

  // ── Staking ───────────────────────────────────────────────────────────────
  if (config.staking !== undefined) {
    const out = designStaking({
      ...config.staking,
      projectName: config.projectName,
      emitDeploy,
      emitSdk,
    });
    modules.staking = out;
    allFiles.push(...out.files);
    modulesInvoked.push("staking");
  }

  // ── Yield ─────────────────────────────────────────────────────────────────
  if (config.yield !== undefined) {
    const out = designYield({
      ...config.yield,
      projectName: config.projectName,
      emitDeploy,
      emitSdk,
    });
    modules.yield = out;
    allFiles.push(...out.files);
    modulesInvoked.push("yield");
  }

  // ── Treasury ──────────────────────────────────────────────────────────────
  if (config.treasury !== undefined) {
    const out = designTreasury({
      ...config.treasury,
      projectName: config.projectName,
      emitDeploy,
      emitSdk,
    });
    modules.treasury = out;
    allFiles.push(...out.files);
    modulesInvoked.push("treasury");
  }

  // ── Tokenomics (pure computation) ─────────────────────────────────────────
  if (config.tokenomics !== undefined) {
    const out = designTokenomics(config.tokenomics);
    modules.tokenomics = out;
    modulesInvoked.push("tokenomics");
    // No files — tokenomics is pure data
  }

  // ── Bridge (pure computation + config) ────────────────────────────────────
  if (config.bridge !== undefined) {
    const out = designBridge({
      ...config.bridge,
      projectName: config.projectName,
    });
    modules.bridge = out;
    modulesInvoked.push("bridge");
    // No Solidity files — bridge uses canonical protocol contracts
  }

  // ── Deduplicate files by path ──────────────────────────────────────────────
  const seen = new Set<string>();
  const uniqueFiles = allFiles.filter(f => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });

  const solidityCount = uniqueFiles.filter(f => f.path.endsWith(".sol")).length;

  const stats: DeFiSystemStats = {
    projectName:        config.projectName,
    modulesInvoked,
    filesGenerated:     uniqueFiles.length,
    contractsGenerated: solidityCount,
    timestamp:          new Date().toISOString(),
  };

  return { files: uniqueFiles, modules, stats };
}
