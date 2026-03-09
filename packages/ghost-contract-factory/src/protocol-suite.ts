/**
 * protocol-suite.ts — Full DeFi protocol suite generator.
 *
 * One call generates a complete, linked DeFi architecture:
 *
 *    Token (GRC-20)  →  Staking  →  DAO governance
 *                    →  Vault (yield)
 *                    →  Vesting (team/investor)
 *                    →  DEX (GhostXchange pair+factory+router)
 *
 * All generated contracts are Forge-lint-compliant Solidity 0.8.24.
 */

import { generateDefiToken,  type DefiTokenOptions  } from "./defi-generator.js";
import { generateStaking,    type StakingOptions     } from "./staking-generator.js";
import { generateDao,        type DaoOptions         } from "./dao-generator.js";
import { generateDexBundle,  type DexOptions         } from "./dex-generator.js";
import { generateVault,      type VaultOptions       } from "./vault-generator.js";
import { generateVesting,    type VestingOptions     } from "./vesting-generator.js";

// ── Output types ──────────────────────────────────────────────────────────────

export interface SuiteFile {
  /** Workspace-relative output path */
  path: string;
  /** Solidity source content */
  content: string;
  /** Role this contract plays in the suite */
  role: SuiteRole;
}

export type SuiteRole =
  | "token"
  | "staking"
  | "dao"
  | "vault"
  | "vesting"
  | "dex-pair"
  | "dex-factory"
  | "dex-router";

export interface ProtocolSuiteOutput {
  /** Protocol name */
  name: string;
  /** Timestamp (ISO 8601) */
  generatedAt: string;
  /** List of all generated Solidity files */
  files: SuiteFile[];
  /** Summary stats */
  stats: {
    totalFiles: number;
    roles: SuiteRole[];
  };
}

// ── Suite options ─────────────────────────────────────────────────────────────

export interface ProtocolSuiteOptions {
  /**
   * Protocol brand name in PascalCase, e.g. "GhostDeFi".
   * Used to prefix all contract names: GhostDeFiToken, GhostDeFiStaking, …
   */
  name: string;

  /** Base output directory. Defaults to "contracts/src/generated" */
  outDir?: string;

  /** Which sub-protocols to include. Default: all */
  include?: SuiteRole[];

  /** Token-specific overrides */
  token?: Partial<DefiTokenOptions>;
  /** Staking-specific overrides */
  staking?: Partial<StakingOptions>;
  /** DAO-specific overrides */
  dao?: Partial<DaoOptions>;
  /** Vault-specific overrides */
  vault?: Partial<VaultOptions>;
  /** Vesting-specific overrides */
  vesting?: Partial<VestingOptions>;
  /** DEX-specific overrides */
  dex?: Partial<DexOptions>;
}

// ── Default included roles ────────────────────────────────────────────────────

const ALL_ROLES: SuiteRole[] = [
  "token",
  "staking",
  "dao",
  "vault",
  "vesting",
  "dex-pair",
  "dex-factory",
  "dex-router",
];

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Generate a full DeFi protocol suite for GhostChain.
 *
 * @param opts  Suite configuration
 * @returns     All generated Solidity files with their roles
 */
export function generateProtocolSuite(opts: ProtocolSuiteOptions): ProtocolSuiteOutput {
  const { name, outDir = "contracts/src/generated" } = opts;
  const include = new Set<SuiteRole>(opts.include ?? ALL_ROLES);

  const files: SuiteFile[] = [];

  // ── Token ──────────────────────────────────────────────────────────────────

  if (include.has("token")) {
    const contractName = `${name}Token`;
    const path = `${outDir}/${contractName}.sol`;
    const content = generateDefiToken(
      {
        name: contractName,
        tokenName: contractName,
        symbol: name.toUpperCase().slice(0, 6),
        mintable: true,
        burnable: true,
        ...opts.token,
      },
      path,
    );
    files.push({ path, content, role: "token" });
  }

  // ── Staking ────────────────────────────────────────────────────────────────

  if (include.has("staking")) {
    const contractName = `${name}Staking`;
    const path = `${outDir}/${contractName}.sol`;
    const content = generateStaking(
      {
        name: contractName,
        label: name,
        ...opts.staking,
      },
      path,
    );
    files.push({ path, content, role: "staking" });
  }

  // ── DAO ────────────────────────────────────────────────────────────────────

  if (include.has("dao")) {
    const contractName = `${name}DAO`;
    const path = `${outDir}/${contractName}.sol`;
    const content = generateDao(
      {
        name: contractName,
        label: name,
        ...opts.dao,
      },
      path,
    );
    files.push({ path, content, role: "dao" });
  }

  // ── Vault ──────────────────────────────────────────────────────────────────

  if (include.has("vault")) {
    const contractName = `${name}Vault`;
    const path = `${outDir}/${contractName}.sol`;
    const content = generateVault(
      {
        name: contractName,
        label: name,
        shareName: `${name} Vault Shares`,
        shareSymbol: `gv${name.toUpperCase().slice(0, 3)}`,
        ...opts.vault,
      },
      path,
    );
    files.push({ path, content, role: "vault" });
  }

  // ── Vesting ────────────────────────────────────────────────────────────────

  if (include.has("vesting")) {
    const contractName = `${name}Vesting`;
    const path = `${outDir}/${contractName}.sol`;
    const content = generateVesting(
      {
        name: contractName,
        label: name,
        revocable: true,
        ...opts.vesting,
      },
      path,
    );
    files.push({ path, content, role: "vesting" });
  }

  // ── DEX (pair + factory + router) ─────────────────────────────────────────

  const dexRoles = (["dex-pair", "dex-factory", "dex-router"] as SuiteRole[]).filter(
    (r) => include.has(r),
  );

  if (dexRoles.length > 0) {
    const dexOutDir = `contracts/src/ghostx`;
    const bundle = generateDexBundle(
      { label: name, ...opts.dex },
      dexOutDir,
    );

    if (include.has("dex-pair")) {
      files.push({ path: bundle.outputPaths.pair,    content: bundle.pair,    role: "dex-pair"    });
    }
    if (include.has("dex-factory")) {
      files.push({ path: bundle.outputPaths.factory, content: bundle.factory, role: "dex-factory" });
    }
    if (include.has("dex-router")) {
      files.push({ path: bundle.outputPaths.router,  content: bundle.router,  role: "dex-router"  });
    }
  }

  const roles = files.map((f) => f.role);

  return {
    name,
    generatedAt: new Date().toISOString(),
    files,
    stats: { totalFiles: files.length, roles },
  };
}
