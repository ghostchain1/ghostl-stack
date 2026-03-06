#!/usr/bin/env node
/**
 * @file tools/branding/audit-branding.ts
 * @description GhostChain Branding Audit — repo-wide scan for upstream brand leakage.
 *
 * Integrates with @ghostchain/brand-enforcer (packages/brand-enforcer) for
 * structural violation patterns (BRAND-001 → BRAND-013) and adds a fast
 * whole-repo text scan against the 15-layer branding-rules.json.
 *
 * Run:
 *   node --experimental-strip-types tools/branding/audit-branding.ts [path] [--json]
 *   pnpm brand:audit
 *
 * Exit codes:
 *   0  Clean (no CRITICAL or HIGH violations)
 *   1  CRITICAL or HIGH violations found
 *   2  Usage error
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandRule {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  term: string;
  layer: string;
  suggestion: string;
  bridgeExempt: boolean;
  compatExempt: boolean;
}

interface Violation {
  file: string;
  line: number;
  col: number;
  rule: BrandRule;
  context: string;
}

interface ScanResult {
  scanned: number;
  exempt: number;
  violations: Violation[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, "branding-rules.json");
const ROOT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../..");

const IS_JSON = process.argv.includes("--json");

const cfg = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));

// ---------------------------------------------------------------------------
// Build flat violation patterns from layers + forbidden lists
// ---------------------------------------------------------------------------

const RULES: BrandRule[] = [
  // Layer-level forbidden terms (bridge-aware)
  { id: "GBC-001", severity: "CRITICAL", term: "Ethereum",  layer: "1_core_chain_identity",  suggestion: "GhostChain",   bridgeExempt: false, compatExempt: false },
  { id: "GBC-002", severity: "CRITICAL", term: "ethereum",  layer: "1_core_chain_identity",  suggestion: "ghostchain",   bridgeExempt: false, compatExempt: false },
  { id: "GBC-003", severity: "CRITICAL", term: "Etherscan", layer: "4_explorer",             suggestion: "GhostScan",    bridgeExempt: false, compatExempt: false },
  { id: "GBC-004", severity: "CRITICAL", term: "etherscan", layer: "4_explorer",             suggestion: "ghostscan",    bridgeExempt: false, compatExempt: false },
  { id: "GBC-005", severity: "HIGH",     term: "ENS",       layer: "15_identity_layer",      suggestion: "GNS",          bridgeExempt: true,  compatExempt: false },
  { id: "GBC-006", severity: "HIGH",     term: "MetaMask",  layer: "9_wallet",               suggestion: "GhostWallet",  bridgeExempt: true,  compatExempt: false },
  { id: "GBC-007", severity: "HIGH",     term: "Infura",    layer: "6_infrastructure",       suggestion: "GhostRPC",     bridgeExempt: false, compatExempt: false },
  { id: "GBC-008", severity: "HIGH",     term: "Alchemy",   layer: "6_infrastructure",       suggestion: "GhostRPC",     bridgeExempt: false, compatExempt: false },
  { id: "GBC-009", severity: "HIGH",     term: "web3.js",   layer: "3_rpc_sdk",              suggestion: "ghost-sdk",    bridgeExempt: false, compatExempt: false },
  // Canonical-context forbidden (permitted in compat/bridge layers)
  { id: "GBC-010", severity: "HIGH",     term: "ethers.js", layer: "11_developer_ecosystem", suggestion: "ghost-sdk",    bridgeExempt: true,  compatExempt: true  },
  { id: "GBC-011", severity: "MEDIUM",   term: "ethers",    layer: "3_rpc_sdk",              suggestion: "ghost",        bridgeExempt: true,  compatExempt: true  },
  { id: "GBC-012", severity: "MEDIUM",   term: "ETH",       layer: "2_token_identity",       suggestion: "GST",          bridgeExempt: true,  compatExempt: false },
];

// ---------------------------------------------------------------------------
// Path exemption helpers
// ---------------------------------------------------------------------------

const EXEMPT_SUBSTRINGS: string[] = cfg.exemptPathPatterns ?? [];
const BRIDGE_SUBSTRINGS: string[] = cfg.bridgeExemptPatterns ?? [];
const COMPAT_SUBSTRINGS: string[] = cfg.compatExemptPatterns ?? [];
const SCANNABLE = new Set<string>(cfg.scannableExtensions ?? []);

function isExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return EXEMPT_SUBSTRINGS.some((s) => rel.includes(s));
}

function isBridgeExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath).toLowerCase();
  return BRIDGE_SUBSTRINGS.some((s) => rel.includes(s));
}

function isCompatExempt(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return COMPAT_SUBSTRINGS.some((s) => rel.includes(s));
}

function isScannable(filePath: string): boolean {
  return SCANNABLE.has(path.extname(filePath).toLowerCase());
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanFile(filePath: string, violations: Violation[]): void {
  const bridge = isBridgeExempt(filePath);
  const compat = isCompatExempt(filePath);

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return; // binary or unreadable — skip
  }

  const lines = content.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Skip lines with explicit ignore comment
    if (line.includes("brand-enforcer-ignore")) continue;
    // Skip EIP protocol-standard strings that must stay verbatim for wallet compat
    if (line.includes("\\x19Ethereum Signed Message") || line.includes("x19Ethereum")) continue;
    if (line.includes("wallet_switchEthereumChain") || line.includes("wallet_addEthereumChain")) continue;
    // Skip window.ethereum / (window as any).ethereum — EIP-1193 browser injection point name
    if (/window[\s\S]*?\.ethereum/.test(line)) continue;
    // Skip package.json override/resolution keys that must match upstream npm package names
    if (/^\s*"(ethereum[^"]*|@ethereumjs[^"]*|ethereumjs[^"]*)"\s*:\s*"file:/.test(line)) continue;
    // Skip npm dependency declarations: "ethers": "^6.x" (cannot rename npm package)
    if (/^\s*"ethers"\s*:\s*"[\^~]?\d/.test(line)) continue;
    // Skip TypeScript path alias mappings: "ghost": ["../../node_modules/ethers/..."]
    if (/node_modules\/ethers\//.test(line)) continue;
    // Skip Besu/Geth API namespace flags — ETH here is the RPC namespace, not a token name
    if (/--rpc-http-api=.*\bETH\b/.test(line) || /--rpc-ws-api=.*\bETH\b/.test(line)) continue;
    // Skip lines that are purely URLs (contains http) — legitimately reference Ethereum URLs
    if (/https?:\/\//.test(line) && !line.includes('"') && !line.includes("'")) continue;

    for (const rule of RULES) {
      if (rule.bridgeExempt && bridge) continue;
      if (rule.compatExempt && compat) continue;

      const col = line.indexOf(rule.term);
      if (col === -1) continue;

      // Avoid false-positive: "ETH" inside "METHOD", "synthetic", etc.
      if (rule.term === "ETH" || rule.term === "ENS") {
        const before = col > 0 ? line[col - 1] : " ";
        const after = col + rule.term.length < line.length ? line[col + rule.term.length] : " ";
        if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) continue;
      }

      violations.push({
        file: path.relative(ROOT, filePath),
        line: lineIdx + 1,
        col: col + 1,
        rule,
        context: line.trim().slice(0, 120),
      });
    }
  }
}

function walk(dir: string, violations: Violation[], stats: { scanned: number; exempt: number }): void {
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
      walk(full, violations, stats);
    } else if (entry.isFile()) {
      if (isExempt(full) || !isScannable(full)) {
        stats.exempt++;
        continue;
      }
      stats.scanned++;
      scanFile(full, violations);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const t0 = Date.now();
  const violations: Violation[] = [];
  const stats = { scanned: 0, exempt: 0 };

  walk(ROOT, violations, stats);

  const result: ScanResult = {
    scanned: stats.scanned,
    exempt: stats.exempt,
    violations,
    durationMs: Date.now() - t0,
  };

  if (IS_JSON) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printText(result);
  }

  const hasCriticalOrHigh = violations.some(
    (v) => v.rule.severity === "CRITICAL" || v.rule.severity === "HIGH"
  );
  process.exit(hasCriticalOrHigh ? 1 : 0);
}

function printText(result: ScanResult): void {
  const { violations, scanned, exempt, durationMs } = result;
  const RESET = "\x1b[0m";
  const RED   = "\x1b[31m";
  const YLW   = "\x1b[33m";
  const CYN   = "\x1b[36m";
  const GRY   = "\x1b[90m";
  const GRN   = "\x1b[32m";

  const color = (s: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") =>
    ({ CRITICAL: RED, HIGH: YLW, MEDIUM: CYN, LOW: GRY }[s] ?? "");

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║    GhostChain Branding Enforcement System — Audit    ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  Root:     ${ROOT}`);
  console.log(`  Scanned:  ${scanned}  files`);
  console.log(`  Exempt:   ${exempt}  files`);
  console.log(`  Duration: ${durationMs}ms\n`);

  if (violations.length === 0) {
    console.log(`${GRN}✔  No branding violations found. GhostStack is 100% Ghost-branded.${RESET}\n`);
    return;
  }

  // Group by severity for summary
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const v of violations) bySeverity[v.rule.severity]++;

  console.log("  Summary:");
  for (const [sev, count] of Object.entries(bySeverity)) {
    if (count > 0) console.log(`    ${color(sev as Violation["rule"]["severity"])}${sev}${RESET}: ${count}`);
  }
  console.log();

  // Group by file for readability
  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  for (const [file, viols] of byFile) {
    console.log(`  ${GRY}${file}${RESET}`);
    for (const v of viols) {
      const sev = color(v.rule.severity);
      console.log(`    ${sev}[${v.rule.id}] ${v.rule.severity}${RESET}  line ${v.line}:${v.col}`);
      console.log(`    ${GRY}term: "${v.rule.term}" → suggest: "${v.rule.suggestion}"${RESET}`);
      console.log(`    ${GRY}${v.context}${RESET}`);
      console.log();
    }
  }

  console.log(`\n  Total violations: ${violations.length}`);
  console.log(`  Run "pnpm brand:enforce" for automatic safe fixes.\n`);
}

run();
