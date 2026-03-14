/**
 * generator.ts — Main contract factory dispatcher.
 *
 * Single entry point: `generateContract(type, name, options)` dispatches to the
 * correct generator and returns the Solidity source + optional deploy script + SDK wrapper.
 */

import { z } from "zod";

import { generateDefiToken,  type DefiTokenOptions  } from "./defi-generator.js";
import { generateNft,        type NftOptions         } from "./nft-generator.js";
import { generateStaking,    type StakingOptions     } from "./staking-generator.js";
import { generateDao,        type DaoOptions         } from "./dao-generator.js";
import { generateDexBundle,  type DexOptions         } from "./dex-generator.js";
import { generateVault,          type VaultOptions          } from "./vault-generator.js";
import { generateVesting,        type VestingOptions        } from "./vesting-generator.js";
import { generateYieldFarm,      type YieldFarmOptions      } from "./yield-farm-generator.js";
import { generateTreasuryBuyback, type TreasuryBuybackOptions } from "./treasury-buyback-generator.js";
import { generateDeployScript, type DeployScriptOptions } from "./deployment-writer.js";
import { generateSdkWrapper } from "./sdk-sync.js";

// ── Type registry ─────────────────────────────────────────────────────────────

export const CONTRACT_TYPES = ["token", "nft", "staking", "dao", "dex", "vault", "vesting", "yield-farm", "treasury-buyback"] as const;
export type ContractType = typeof CONTRACT_TYPES[number];

// ── Input schema ──────────────────────────────────────────────────────────────

export const GenerateInputSchema = z.object({
  /** One of: token | nft | staking | dao | dex */
  type: z.enum(CONTRACT_TYPES),
  /** Solidity contract name (PascalCase), e.g. "GhostGovToken" */
  name: z.string().min(2).regex(/^[A-Z][A-Za-z0-9]*$/, "Must be PascalCase"),
  /** Output directory for the Solidity file (default "contracts/src/generated/") */
  outDir: z.string().optional(),
  /** Type-specific generator options */
  options: z.record(z.unknown()).optional(),
  /**
   * Whether to emit a Hardhat deploy script alongside the contract.
   * Default: true
   */
  emitDeployScript: z.boolean().optional(),
  /**
   * Whether to emit a TypeScript SDK wrapper alongside the contract.
   * Default: false
   */
  emitSdkWrapper: z.boolean().optional(),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;

// ── Output ────────────────────────────────────────────────────────────────────

export interface GenerateOutput {
  /** Generated Solidity source (or an array of sources for multi-file bundles like DEX) */
  solidity: GeneratedFile | GeneratedFile[];
  /** Optional Hardhat deploy script */
  deployScript?: GeneratedFile;
  /** Optional TypeScript SDK wrapper */
  sdkWrapper?: GeneratedFile;
}

export interface GeneratedFile {
  /** Workspace-relative output path */
  path: string;
  /** Source content */
  content: string;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Generates a GhostChain smart contract (and optionally deploy script + SDK wrapper).
 *
 * @throws {z.ZodError} if the input schema validation fails.
 */
export function generateContract(input: GenerateInput): GenerateOutput {
  const parsed  = GenerateInputSchema.parse(input);
  const { type, name, options = {} } = parsed;
  const outDir  = parsed.outDir ?? "contracts/src/generated";
  const emitDeploy = parsed.emitDeployScript ?? true;
  const emitSdk    = parsed.emitSdkWrapper   ?? false;

  switch (type) {
    case "token":   return _genToken(name, outDir, options as unknown as DefiTokenOptions,  emitDeploy, emitSdk);
    case "nft":     return _genNft(name, outDir, options as unknown as NftOptions,           emitDeploy, emitSdk);
    case "staking": return _genStaking(name, outDir, options as unknown as StakingOptions,  emitDeploy, emitSdk);
    case "dao":     return _genDao(name, outDir, options as unknown as DaoOptions,          emitDeploy, emitSdk);
    case "dex":     return _genDex(name, outDir, options as unknown as DexOptions,          emitDeploy, emitSdk);
    case "vault":            return _genVault(name, outDir, options as unknown as VaultOptions,           emitDeploy, emitSdk);
    case "vesting":          return _genVesting(name, outDir, options as unknown as VestingOptions,         emitDeploy, emitSdk);
    case "yield-farm":       return _genYieldFarm(name, outDir, options as unknown as YieldFarmOptions,     emitDeploy, emitSdk);
    case "treasury-buyback": return _genTreasuryBuyback(name, outDir, options as unknown as TreasuryBuybackOptions, emitDeploy, emitSdk);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _genToken(
  name: string,
  outDir: string,
  opts: Partial<DefiTokenOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const solidityPath = `${outDir}/${name}.sol`;
  const mergedOpts: DefiTokenOptions = {
    name,
    tokenName: opts.tokenName ?? name,
    symbol:    opts.symbol    ?? name.toUpperCase().slice(0, 6),
    ...opts,
  };

  const content = generateDefiToken(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy
    ? _makeDeployScript(name, opts as DeployScriptOptions)
    : undefined;

  const sdkWrapper = emitSdk
    ? _makeSdkWrapper(name)
    : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genNft(
  name: string,
  outDir: string,
  opts: Partial<NftOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const solidityPath = `${outDir}/${name}.sol`;
  const mergedOpts: NftOptions = {
    name,
    collectionName: opts.collectionName ?? name,
    symbol:         opts.symbol         ?? name.toUpperCase().slice(0, 6),
    ...opts,
  };

  const content  = generateNft(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy ? _makeDeployScript(name, opts as DeployScriptOptions) : undefined;
  const sdkWrapper   = emitSdk   ? _makeSdkWrapper(name) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genStaking(
  name: string,
  outDir: string,
  opts: Partial<StakingOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const solidityPath = `${outDir}/${name}Staking.sol`;
  const mergedOpts: StakingOptions = { name: `${name}Staking`, label: name, ...opts };

  const content  = generateStaking(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy ? _makeDeployScript(`${name}Staking`, opts as DeployScriptOptions) : undefined;
  const sdkWrapper   = emitSdk   ? _makeSdkWrapper(`${name}Staking`) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genDao(
  name: string,
  outDir: string,
  opts: Partial<DaoOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const solidityPath = `${outDir}/${name}DAO.sol`;
  const mergedOpts: DaoOptions = { name: `${name}DAO`, label: name, ...opts };

  const content  = generateDao(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy ? _makeDeployScript(`${name}DAO`, opts as DeployScriptOptions) : undefined;
  const sdkWrapper   = emitSdk   ? _makeSdkWrapper(`${name}DAO`) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genDex(
  name: string,
  outDir: string,
  opts: Partial<DexOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const dexOutDir = `contracts/src/ghostx`;
  const mergedOpts: DexOptions = { label: name, ...opts };
  const bundle    = generateDexBundle(mergedOpts, dexOutDir);

  const solidity: GeneratedFile[] = [
    { path: bundle.outputPaths.pair,    content: bundle.pair    },
    { path: bundle.outputPaths.factory, content: bundle.factory },
    { path: bundle.outputPaths.router,  content: bundle.router  },
  ];

  const deployScript = emitDeploy
    ? _makeDeployScript(`${name}Factory`, {
        constructorArgs: [`process.env.GHOSTX_FEE_RECIPIENT ?? deployer`],
      } as DeployScriptOptions)
    : undefined;

  const sdkWrapper = emitSdk ? _makeSdkWrapper(`${name}Factory`) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genVault(
  name: string,
  outDir: string,
  opts: Partial<VaultOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const contractName = `${name}Vault`;
  const solidityPath = `${outDir}/${contractName}.sol`;
  const mergedOpts: VaultOptions = { name: contractName, label: name, ...opts };

  const content  = generateVault(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy ? _makeDeployScript(contractName, { constructorArgs: ["assetAddress"] } as DeployScriptOptions) : undefined;
  const sdkWrapper   = emitSdk   ? _makeSdkWrapper(contractName) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genVesting(
  name: string,
  outDir: string,
  opts: Partial<VestingOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const contractName = `${name}Vesting`;
  const solidityPath = `${outDir}/${contractName}.sol`;
  const mergedOpts: VestingOptions = { name: contractName, label: name, revocable: true, ...opts };

  const content  = generateVesting(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy
    ? _makeDeployScript(contractName, {
        constructorArgs: ["tokenAddress", "beneficiaryAddress", "cliffSeconds", "durationSeconds", "true"],
      } as DeployScriptOptions)
    : undefined;
  const sdkWrapper = emitSdk ? _makeSdkWrapper(contractName) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genYieldFarm(
  name: string,
  outDir: string,
  opts: Partial<YieldFarmOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const contractName = `${name}YieldFarm`;
  const solidityPath = `${outDir}/${contractName}.sol`;
  const mergedOpts: YieldFarmOptions = { name: contractName, label: name, ...opts };

  const content  = generateYieldFarm(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy
    ? _makeDeployScript(contractName, { constructorArgs: ["lpTokenAddress", "rewardTokenAddress"] } as DeployScriptOptions)
    : undefined;
  const sdkWrapper = emitSdk ? _makeSdkWrapper(contractName) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _genTreasuryBuyback(
  name: string,
  outDir: string,
  opts: Partial<TreasuryBuybackOptions>,
  emitDeploy: boolean,
  emitSdk: boolean,
): GenerateOutput {
  const contractName = `${name}TreasuryBuyback`;
  const solidityPath = `${outDir}/${contractName}.sol`;
  const mergedOpts: TreasuryBuybackOptions = { name: contractName, label: name, ...opts };

  const content  = generateTreasuryBuyback(mergedOpts, solidityPath);
  const solidity: GeneratedFile = { path: solidityPath, content };

  const deployScript = emitDeploy
    ? _makeDeployScript(contractName, {
        constructorArgs: ["revenueTokenAddress", "targetTokenAddress", "routerAddress"],
      } as DeployScriptOptions)
    : undefined;
  const sdkWrapper = emitSdk ? _makeSdkWrapper(contractName) : undefined;

  return { solidity, deployScript, sdkWrapper };
}

function _makeDeployScript(
  contractName: string,
  opts: Partial<DeployScriptOptions>,
): GeneratedFile {
  const path = `contracts/scripts/deploy_${contractName}.ts`;
  return {
    path,
    content: generateDeployScript({ contractName, ...opts }, path),
  };
}

function _makeSdkWrapper(contractName: string): GeneratedFile {
  const path = `packages/ghost-sdk/src/wrappers/${contractName}.ts`;
  return {
    path,
    content: generateSdkWrapper({ contractName }, path),
  };
}

// ── AI Audit ──────────────────────────────────────────────────────────────────

export type AuditSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AuditFinding {
  id:       string;
  severity: AuditSeverity;
  pattern:  string;
  message:  string;
  match:    string;
}

export interface AuditReport {
  contractName: string;
  findings:     AuditFinding[];
  riskScore:    number;
  passed:       boolean;
  auditedAt:    string;
}

/**
 * Static-analysis audit of Solidity source.
 * Uses the same 12 vulnerability patterns as GhostAuditor AI.
 * Returns an AuditReport — does NOT modify the source.
 */
export function generateAuditReport(contractName: string, soliditySource: string): AuditReport {
  const VULN_PATTERNS: Array<{
    id: string; severity: AuditSeverity; pattern: RegExp; message: string
  }> = [
    { id: "V01", severity: "critical", pattern: /\.call\{value:/g,                   message: "Potential reentrancy — use checks-effects-interactions pattern" },
    { id: "V02", severity: "high",     pattern: /\(bool\s+\w+,\s*\)\s*=.*\.call/g,   message: "Unchecked low-level call return value" },
    { id: "V03", severity: "high",     pattern: /tx\.origin/g,                        message: "tx.origin used for auth — use msg.sender instead" },
    { id: "V04", severity: "critical", pattern: /selfdestruct\s*\(/g,                 message: "selfdestruct present — deprecated and dangerous" },
    { id: "V05", severity: "high",     pattern: /delegatecall\s*\(/g,                 message: "delegatecall — verify trusted callee" },
    { id: "V06", severity: "medium",   pattern: /assembly\s*\{/g,                     message: "Inline assembly detected — verify correctness" },
    { id: "V07", severity: "medium",   pattern: /address\s*\(0\)/g,                   message: "Missing zero-address check" },
    { id: "V08", severity: "low",      pattern: /uint\d*\s*\([^)]+\)/g,               message: "Narrowing cast — verify no overflow" },
    { id: "V09", severity: "critical", pattern: /\b1 ether\b|\b1e18\b/g,              message: "ETH unit used — use GST_UNIT from GhostBrand.sol" },
    { id: "V10", severity: "high",     pattern: /payable\(.*\)\.transfer\s*\(/g,      message: "transfer() may fail — use call{value:} with reentrancy guard" },
    { id: "V11", severity: "low",      pattern: /block\.timestamp/g,                  message: "block.timestamp manipulation risk in time-sensitive logic" },
    { id: "V12", severity: "medium",   pattern: /sload|sstore/g,                      message: "Direct storage slot access — risk of storage collision" },
  ];

  const findings: AuditFinding[] = [];

  for (const vuln of VULN_PATTERNS) {
    const matches = [...soliditySource.matchAll(vuln.pattern)];
    for (const m of matches) {
      findings.push({
        id:       vuln.id,
        severity: vuln.severity,
        pattern:  vuln.pattern.source,
        message:  vuln.message,
        match:    m[0].slice(0, 80),
      });
    }
  }

  const riskScore =
    findings.filter(f => f.severity === "critical").length * 35 +
    findings.filter(f => f.severity === "high").length     * 15 +
    findings.filter(f => f.severity === "medium").length   *  5 +
    findings.filter(f => f.severity === "low").length      *  2;

  return {
    contractName,
    findings,
    riskScore,
    passed:    riskScore === 0,
    auditedAt: new Date().toISOString(),
  };
}
