/**
 * @ghostchain/ghost-contract-factory
 *
 * GhostChain contract factory — code generators for:
 *   - GRC-20 fungible tokens   (type: "token")
 *   - GRC-721 NFT collections  (type: "nft")
 *   - GST/GRC-20 staking       (type: "staking")
 *   - Token-weighted DAOs      (type: "dao")
 *   - GhostXchange DEX bundles (type: "dex")
 *
 * All generated Solidity is:
 *   - Solidity 0.8.24 (exact version, no ^)
 *   - GhostChain Contracts v5.6.1 header
 *   - Forge-lint-compliant (erc20-unchecked-transfer, unsafe-typecast)
 *   - GhostChain branded (GRC not ERC, GST not ETH)
 *
 * @example
 *   import { generateContract } from "@ghostchain/ghost-contract-factory";
 *
 *   const out = generateContract({ type: "token", name: "GhostGovToken", options: { symbol: "GGT" } });
 *   console.log(out.solidity.content);
 */

// ── Main dispatcher ────────────────────────────────────────────────────────────
export { generateContract, generateAuditReport } from "./generator.js";
export type { GenerateInput, GenerateOutput, GeneratedFile, ContractType, AuditReport, AuditFinding, AuditSeverity } from "./generator.js";
export { GenerateInputSchema, CONTRACT_TYPES } from "./generator.js";

// ── Individual generators ─────────────────────────────────────────────────────
export { generateDefiToken   } from "./defi-generator.js";
export type { DefiTokenOptions   } from "./defi-generator.js";

export { generateNft         } from "./nft-generator.js";
export type { NftOptions         } from "./nft-generator.js";

export { generateStaking     } from "./staking-generator.js";
export type { StakingOptions     } from "./staking-generator.js";

export { generateDao         } from "./dao-generator.js";
export type { DaoOptions         } from "./dao-generator.js";

export { generateDexBundle   } from "./dex-generator.js";
export type { DexOptions, DexBundle } from "./dex-generator.js";

export { generateVault       } from "./vault-generator.js";
export type { VaultOptions       } from "./vault-generator.js";

export { generateVesting         } from "./vesting-generator.js";
export type { VestingOptions         } from "./vesting-generator.js";

export { generateYieldFarm       } from "./yield-farm-generator.js";
export type { YieldFarmOptions       } from "./yield-farm-generator.js";

export { generateTreasuryBuyback } from "./treasury-buyback-generator.js";
export type { TreasuryBuybackOptions } from "./treasury-buyback-generator.js";

export { generateProtocolSuite } from "./protocol-suite.js";
export type { ProtocolSuiteOptions, ProtocolSuiteOutput, SuiteFile, SuiteRole } from "./protocol-suite.js";

// ── Script / SDK helpers ──────────────────────────────────────────────────────
export { generateDeployScript } from "./deployment-writer.js";
export type { DeployScriptOptions } from "./deployment-writer.js";

export { generateSdkWrapper  } from "./sdk-sync.js";
export type { SdkWrapperOptions, SdkMethod } from "./sdk-sync.js";

// ── AST primitives (for advanced / custom generators) ────────────────────────
export {
  GHOST_SPDX_MIT,
  GHOST_SPDX_UNLICENSED,
  GHOST_PRAGMA,
  ghostContractHeader,
  namedImport,
  plainImport,
  natspec,
  solidityFile,
  inlineGRC20Interface,
  indent,
  modifier,
  safeTransferCall,
  safeTransferFromCall,
} from "./ast-builder.js";
export type { NatSpecOpts } from "./ast-builder.js";
