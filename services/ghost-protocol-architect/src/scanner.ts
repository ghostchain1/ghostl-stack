/**
 * scanner.ts — Scans contracts/src/ to detect which DeFi protocols are present.
 *
 * Returns a coverage report: which protocol roles exist and which are missing.
 * Used by the design engine to intelligently fill gaps.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── Protocol signatures ───────────────────────────────────────────────────────
//
// We detect each role by looking for key function signatures inside .sol files.
// This is a lightweight heuristic — not a full AST parse.

interface ProtocolSignature {
  role: string;
  keywords: string[];
}

const SIGNATURES: ProtocolSignature[] = [
  { role: "token",   keywords: ["totalSupply", "balanceOf", "transfer", "transferFrom"] },
  { role: "staking", keywords: ["stake(", "unstake(", "claimRewards("] },
  { role: "dao",     keywords: ["createProposal", "vote(", "executeProposal"] },
  { role: "vault",   keywords: ["deposit(", "withdraw(", "convertToShares"] },
  { role: "vesting", keywords: ["release(", "vestedAmount", "BENEFICIARY"] },
  { role: "dex-pair",    keywords: ["swap(", "addLiquidity", "getReserves"] },
  { role: "dex-factory", keywords: ["createPair(", "getPair", "allPairs"] },
  { role: "dex-router",  keywords: ["swapExactTokensForTokens", "addLiquidity", "removeLiquidity"] },
  { role: "nft",     keywords: ["tokenURI(", "ownerOf(", "safeTransferFrom("] },
  { role: "bridge",  keywords: ["depositETH", "finalizeDeposit", "bridgeERC20"] },
  { role: "oracle",  keywords: ["latestAnswer", "getPrice", "updatePrice"] },
  { role: "registry",keywords: ["register(", "resolve(", "setResolver"] },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SolFile {
  path: string;       // workspace-relative
  fullPath: string;   // absolute
  size: number;
}

export interface CoverageReport {
  scannedAt: string;
  contractsDir: string;
  totalSolFiles: number;
  detectedRoles: string[];
  missingRoles: string[];
  files: SolFile[];
  suggestions: string[];
}

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Walk `contractsDir` recursively and return all .sol files.
 */
function walkSol(dir: string): SolFile[] {
  const results: SolFile[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st   = statSync(full);
      if (st.isDirectory()) {
        results.push(...walkSol(full));
      } else if (entry.endsWith(".sol")) {
        results.push({ path: relative(process.cwd(), full), fullPath: full, size: st.size });
      }
    }
  } catch {
    // directory may not exist yet — ignore
  }
  return results;
}

/**
 * Read all Solidity files and detect which protocol roles are present.
 */
export function scanContracts(contractsDir: string): CoverageReport {
  const files = walkSol(contractsDir);

  // Concatenate all sources for keyword scanning (fast heuristic)
  const allSource = files.map((f) => {
    try {
      return require("node:fs").readFileSync(f.fullPath, "utf8") as string;
    } catch {
      return "";
    }
  }).join("\n");

  const detectedRoles: string[] = [];
  const missingRoles: string[]  = [];

  for (const sig of SIGNATURES) {
    const matched = sig.keywords.every((kw) => allSource.includes(kw));
    if (matched) {
      detectedRoles.push(sig.role);
    } else {
      missingRoles.push(sig.role);
    }
  }

  const suggestions = missingRoles.map((role) => {
    switch (role) {
      case "token":      return "Generate a GRC-20 token: POST /api/v1/generate { type: 'token', name: 'MyToken' }";
      case "staking":    return "Generate a staking contract: POST /api/v1/generate { type: 'staking', name: 'MyStaking' }";
      case "dao":        return "Generate a DAO: POST /api/v1/generate { type: 'dao', name: 'MyDAO' }";
      case "vault":      return "Generate a yield vault: POST /api/v1/generate { type: 'vault', name: 'MyVault' }";
      case "vesting":    return "Generate a vesting contract: POST /api/v1/generate { type: 'vesting', name: 'MyVesting' }";
      case "dex-pair":
      case "dex-factory":
      case "dex-router": return "Generate a full DEX: POST /api/v1/generate { type: 'dex', name: 'MyDex' }";
      case "nft":        return "Generate an NFT collection: POST /api/v1/generate { type: 'nft', name: 'MyNFT' }";
      default:           return `Missing protocol role: ${role}`;
    }
  });

  return {
    scannedAt: new Date().toISOString(),
    contractsDir,
    totalSolFiles: files.length,
    detectedRoles,
    missingRoles,
    files: files.map((f) => ({ path: f.path, fullPath: f.fullPath, size: f.size })),
    suggestions: [...new Set(suggestions)],
  };
}
