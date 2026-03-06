/**
 * @file tools/sovereignty/sed-engine/scanner/import-detector.ts
 * @description Pure detection functions — no I/O, no side effects.
 *
 * Three detectors:
 *   detectImports()          — Ethereum package imports in JS/TS
 *   detectRpcCalls()         — eth_* RPC method name strings
 *   detectSolidityStandards()— ERC* interface/contract names + OZ imports in Solidity
 *
 * Every detector returns an array of DetectedHit objects.
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR  = path.join(__dirname, "../rules");

const BRANDING_MAP   = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "branding-map.json"),  "utf8"));
const RPC_MAP_RAW    = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "rpc-mapping.json"),    "utf8"));
const FORBIDDEN_DEPS = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "forbidden-deps.json"), "utf8"));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedHit {
  match:      string;
  suggestion: string;
  severity:   string;
}

// ── Import detector ───────────────────────────────────────────────────────────

/**
 * Detect Ethereum package import statements in JS/TS source code.
 *
 * Detects:
 *   import { ethers } from "ethers"
 *   import { ethers } from 'ethers'
 *   const ethers = require("ethers")
 *   import type { Provider } from "@ethersproject/providers"
 *   import Web3 from "web3"
 */
const IMPORT_PATTERNS: Array<{ pattern: RegExp; pkg: string }> = [
  { pattern: /from\s+["']ethers["']/g,                       pkg: "ethers" },
  { pattern: /from\s+["']web3["']/g,                         pkg: "web3" },
  { pattern: /require\s*\(\s*["']ethers["']\s*\)/g,          pkg: "ethers" },
  { pattern: /require\s*\(\s*["']web3["']\s*\)/g,            pkg: "web3" },
  { pattern: /from\s+["']@ethersproject\/[^"']+["']/g,       pkg: "@ethersproject" },
  { pattern: /from\s+["']@openzeppelin\/contracts\/[^"']+["']/g, pkg: "@openzeppelin/contracts" },
  { pattern: /require\s*\(\s*["']@ethersproject\/[^"']+["']\s*\)/g, pkg: "@ethersproject" },
  { pattern: /from\s+["']web3-eth["']/g,                     pkg: "web3-eth" },
  { pattern: /from\s+["']ethereumjs-util["']/g,              pkg: "ethereumjs-util" },
  { pattern: /from\s+["']ethereumjs-tx["']/g,                pkg: "ethereumjs-tx" },
  { pattern: /from\s+["']eth-sig-util["']/g,                 pkg: "eth-sig-util" },
];

const SEVERITY_MAP: Record<string, string> = FORBIDDEN_DEPS.severity ?? {};
const EQUIVALENTS: Record<string, string>  = FORBIDDEN_DEPS.ghostEquivalents ?? {};
const IMPORTS_JS: Record<string, string>   = BRANDING_MAP.imports?.js ?? {};

export function detectImports(code: string): DetectedHit[] {
  const hits: DetectedHit[] = [];
  const seen = new Set<string>();

  for (const { pattern, pkg } of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(code)) !== null) {
      const match = m[0];
      if (seen.has(match)) continue;
      seen.add(match);

      // Find suggested replacement in branding-map imports
      let suggestion = `// Replace with ${EQUIVALENTS[pkg] ?? "@ghostchain/sdk"}`;
      for (const [from, to] of Object.entries(IMPORTS_JS)) {
        if (match.includes(from.split("\"")[1] ?? from.split("'")[1] ?? "")) {
          suggestion = match.replace(from, to) + ` // SED: ${from} → ${to}`;
          break;
        }
      }

      hits.push({
        match,
        suggestion,
        severity: SEVERITY_MAP[pkg] ?? "HIGH",
      });
    }
  }

  return hits;
}

// ── RPC call detector ─────────────────────────────────────────────────────────

/**
 * Detect hardcoded eth_* RPC method name strings.
 *
 * Detects:
 *   "eth_blockNumber"
 *   'eth_call'
 *   `eth_getLogs`
 *   provider.send("eth_blockNumber", [...])
 */
const RPC_METHODS = Object.keys(RPC_MAP_RAW.mappings ?? {});
const RPC_REPLACEMENTS: Record<string, string> = RPC_MAP_RAW.mappings ?? {};

// Build a single regex matching any eth_* method as a quoted/template string
const RPC_REGEX = new RegExp(
  `["'\`](${RPC_METHODS.map(m => m.replace("_", "_")).join("|")})["'\`]`,
  "g"
);

export function detectRpcCalls(code: string): DetectedHit[] {
  const hits: DetectedHit[] = [];
  const seen = new Set<string>();

  RPC_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RPC_REGEX.exec(code)) !== null) {
    const method  = m[1]!;
    const full    = m[0];
    if (seen.has(full)) continue;
    seen.add(full);

    const ghostMethod = RPC_REPLACEMENTS[method];
    hits.push({
      match:      full,
      suggestion: ghostMethod ? full.replace(method, ghostMethod) : `ghost_${method.slice(4)}`,
      severity:   "HIGH",
    });
  }

  return hits;
}

// ── Solidity standard detector ────────────────────────────────────────────────

/**
 * Detect Ethereum contract standards and OpenZeppelin imports in Solidity.
 *
 * Detects:
 *   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
 *   contract MyToken is ERC20 {
 *   interface IERC721 is IERC165 {
 */
const SOL_STANDARDS_MAP: Record<string, string> = BRANDING_MAP.solidityStandards ?? {};

const SOL_OZ_REGEX     = /import\s+["']@openzeppelin\/contracts\/[^"']+["']/g;
const SOL_ERC_REGEX    = /\b(ERC20|ERC721|ERC1155|ERC4626|ERC2771|IERC20|IERC721|IERC1155|IERC4626)\b/g;

export function detectSolidityStandards(code: string): DetectedHit[] {
  const hits: DetectedHit[] = [];
  const seen = new Set<string>();

  // OZ imports
  SOL_OZ_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SOL_OZ_REGEX.exec(code)) !== null) {
    const match = m[0];
    if (seen.has(match)) continue;
    seen.add(match);

    let suggestion = match;
    for (const [from, to] of Object.entries(SOL_STANDARDS_MAP)) {
      if (match.includes(from)) {
        suggestion = match.replace(from, to);
        break;
      }
    }
    hits.push({ match, suggestion, severity: "HIGH" });
  }

  // ERC interface/contract names
  SOL_ERC_REGEX.lastIndex = 0;
  while ((m = SOL_ERC_REGEX.exec(code)) !== null) {
    const match = m[0];
    if (seen.has(match)) continue;
    seen.add(match);

    const suggestion = SOL_STANDARDS_MAP[`is ${match}`]?.replace("is ", "") ?? `G${match.slice(1)}`;
    hits.push({ match, suggestion, severity: "MEDIUM" });
  }

  return hits;
}
