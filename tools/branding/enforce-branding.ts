#!/usr/bin/env node
/**
 * @file tools/branding/enforce-branding.ts
 * @description GhostChain Branding Enforcer — automatic safe fixer.
 *
 * ⚠ SAFE MODE BY DEFAULT: Replacements respect allowlists.
 *    - Bridge/cross-chain files: ETH references preserved (interop intentional)
 *    - Compat layer (ghost-sdk-core/src/ethers/): ethers references preserved
 *    - Lock files, binaries, build artifacts: never touched
 *    - Dry-run by default — pass --write to apply changes
 *
 * Run:
 *   node --experimental-strip-types tools/branding/enforce-branding.ts           # dry-run
 *   node --experimental-strip-types tools/branding/enforce-branding.ts --write   # apply
 *   pnpm brand:enforce
 *   pnpm brand:enforce:write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Replacement {
  from: string;
  to: string;
  bridgeExempt: boolean;
  compatExempt: boolean;
}

interface FixResult {
  file: string;
  changes: Array<{ from: string; to: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, "branding-rules.json");
const ROOT = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../..");

const DRY_RUN = !process.argv.includes("--write");
const IS_JSON = process.argv.includes("--json");

const cfg = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));

// ---------------------------------------------------------------------------
// Replacement table — ordered: longer/more-specific first to avoid partial hits
// ---------------------------------------------------------------------------

const REPLACEMENTS: Replacement[] = [
  // Unconditional — these are never legitimately upstream branding
  { from: "Etherscan",  to: "GhostScan",   bridgeExempt: false, compatExempt: false },
  { from: "etherscan",  to: "ghostscan",   bridgeExempt: false, compatExempt: false },
  { from: "web3.js",    to: "ghost-sdk",   bridgeExempt: false, compatExempt: false },
  { from: "Infura",     to: "GhostRPC",    bridgeExempt: false, compatExempt: false },
  { from: "Alchemy",    to: "GhostRPC",    bridgeExempt: false, compatExempt: false },
  // Bridge-exempt: ENS / MetaMask may appear in bridge/adapter integrations
  { from: "MetaMask",   to: "GhostWallet", bridgeExempt: true,  compatExempt: false },
  { from: " ENS ",      to: " GNS ",       bridgeExempt: true,  compatExempt: false },
  // Compat-exempt: ethers.js references in the ghost-sdk-core compat subtree are intentional
  { from: "ethers.js",  to: "ghost-sdk",   bridgeExempt: true,  compatExempt: true  },
  // Ethereum → GhostChain: never legitimate in canonical chain context
  { from: "Ethereum",   to: "GhostChain",  bridgeExempt: false, compatExempt: false },
  // NOTE: "ethereum" (lowercase) and "ethers" (without .js) are NOT replaced automatically
  // because they appear in too many legitimate package names, import specifiers, and SDK paths.
  // Use the audit tool to review these manually.
];

// ---------------------------------------------------------------------------
// File filters — same logic as audit-branding.ts
// ---------------------------------------------------------------------------

const EXEMPT_SUBSTRINGS: string[] = cfg.exemptPathPatterns ?? [];
const BRIDGE_SUBSTRINGS: string[] = cfg.bridgeExemptPatterns ?? [];
const COMPAT_SUBSTRINGS: string[] = cfg.compatExemptPatterns ?? [];

// Extensions safe to text-replace
const WRITABLE_EXTENSIONS = new Set([
  ".sol", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".md", ".yml", ".yaml",
]);

// Lock files and generated files — NEVER auto-fix
const NEVER_WRITE_PATTERNS = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".snap",
  "typechain-types/",
  "broadcast/",
  ".d.ts",
];

function isExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return EXEMPT_SUBSTRINGS.some((s) => rel.includes(s));
}

function isNeverWrite(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return NEVER_WRITE_PATTERNS.some((s) => rel.includes(s));
}

function isBridgeExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath).toLowerCase();
  return BRIDGE_SUBSTRINGS.some((s) => rel.includes(s));
}

function isCompatExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return COMPAT_SUBSTRINGS.some((s) => rel.includes(s));
}

function isWritable(filePath: string): boolean {
  return WRITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

// ---------------------------------------------------------------------------
// Per-file fixer
// ---------------------------------------------------------------------------

function processFile(filePath: string): FixResult | null {
  if (isExempt(filePath) || isNeverWrite(filePath) || !isWritable(filePath)) return null;

  const bridge = isBridgeExempt(filePath);
  const compat = isCompatExempt(filePath);

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  const changes: FixResult["changes"] = [];
  let modified = content;

  for (const rep of REPLACEMENTS) {
    if (rep.bridgeExempt && bridge) continue;
    if (rep.compatExempt && compat) continue;
    if (!modified.includes(rep.from)) continue;

    let count = 0;
    modified = modified.replaceAll(rep.from, () => { count++; return rep.to; });
    if (count > 0) changes.push({ from: rep.from, to: rep.to, count });
  }

  if (changes.length === 0) return null;

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, modified, "utf8");
  }

  return { file: path.relative(ROOT, filePath), changes };
}

// ---------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------

function walk(dir: string, results: FixResult[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExempt(full + "/")) continue;
      walk(full, results);
    } else if (entry.isFile()) {
      const r = processFile(full);
      if (r) results.push(r);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const t0 = Date.now();
  const results: FixResult[] = [];

  walk(ROOT, results);

  const totalChanges = results.reduce((n, r) => n + r.changes.length, 0);

  if (IS_JSON) {
    process.stdout.write(JSON.stringify({ dryRun: DRY_RUN, files: results, totalChanges }, null, 2) + "\n");
    return;
  }

  const GRN  = "\x1b[32m";
  const YLW  = "\x1b[33m";
  const GRY  = "\x1b[90m";
  const BOLD = "\x1b[1m";
  const RESET= "\x1b[0m";
  const mode = DRY_RUN ? `${YLW}[DRY RUN — pass --write to apply]${RESET}` : `${GRN}[APPLIED]${RESET}`;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   GhostChain Branding Enforcer — Auto-Fix            ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  Mode:    ${mode}`);
  console.log(`  Root:    ${ROOT}`);
  console.log(`  Files:   ${results.length} modified`);
  console.log(`  Changes: ${totalChanges} replacements\n`);

  if (results.length === 0) {
    console.log(`${GRN}✔  Already fully Ghost-branded — nothing to fix.${RESET}\n`);
    return;
  }

  for (const r of results) {
    console.log(`  ${BOLD}${r.file}${RESET}`);
    for (const c of r.changes) {
      console.log(`    ${GRY}"${c.from}" → "${c.to}"${RESET}  ×${c.count}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n  ${YLW}Run with --write to apply all ${totalChanges} replacements.${RESET}\n`);
  } else {
    console.log(`\n  ${GRN}✔  ${totalChanges} branding replacements applied in ${Date.now() - t0}ms.${RESET}\n`);
    console.log(`  ${GRY}Run "pnpm brand:audit" to verify clean state.${RESET}\n`);
  }
}

run();
