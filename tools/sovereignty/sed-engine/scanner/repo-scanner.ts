/**
 * @file tools/sovereignty/sed-engine/scanner/repo-scanner.ts
 * @description GhostChain SED-Engine — full repository scanner.
 *
 * Walks the entire repo tree, skipping exempt paths, and detects three
 * categories of Ethereum dependency violation:
 *
 *   1. EthImport   — `import ... from "ethers"` / `require("ethers")` etc.
 *   2. RpcCall     — `eth_blockNumber`, `eth_call`, etc. hardcoded in source
 *   3. SolStandard — `ERC20`, `IERC721`, `@openzeppelin/contracts` in .sol files
 *
 * Usage:
 *   import { scanRepo } from "./repo-scanner.js";
 *   const report = scanRepo("/home/ghost/ghostl-stack");
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectImports }         from "./import-detector.ts";
import { detectRpcCalls }        from "./import-detector.ts";
import { detectSolidityStandards } from "./import-detector.ts";

// ── Configuration ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, "../rules");

const BRANDING_MAP   = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "branding-map.json"),  "utf8"));
const FORBIDDEN_DEPS = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "forbidden-deps.json"), "utf8"));
const RPC_MAPPING    = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "rpc-mapping.json"),    "utf8"));

const EXEMPT_PATHS: string[]   = BRANDING_MAP.exemptPatterns    ?? [];
const SCANNABLE_EXTS           = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sol", ".json", ".yml", ".yaml"]);
const HARD_SKIP                = new Set(["node_modules", ".git", "dist", "out", "out-codex", "artifacts", "cache", "cache-codex", ".next", "coverage", ".husky"]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViolationKind = "EthImport" | "RpcCall" | "SolStandard" | "ForbiddenDep";
export type Severity      = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface Finding {
  kind:       ViolationKind;
  severity:   Severity;
  file:       string;             // repo-relative path
  line:       number;
  col:        number;
  match:      string;             // the detected text
  suggestion: string;             // Ghost sovereign replacement
  context:    string;             // surrounding code snippet (trimmed)
}

export interface ScanReport {
  root:          string;
  scannedAt:     string;
  scanned:       number;
  scannedFiles:  number;  // alias for scanned
  exempt:        number;
  findings:      Finding[];
  durationMs:    number;
  ok:            boolean;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

function isExempt(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath).replace(/\\/g, "/");
  if (EXEMPT_PATHS.some(p => rel.startsWith(p) || rel.includes(p))) return true;
  // Also exempt any file that contains the ignore comment
  return false;
}

function isHardSkip(segment: string): boolean {
  return HARD_SKIP.has(segment);
}

function hasIgnoreComment(content: string): boolean {
  return content.includes("sed-engine-ignore") || content.includes("brand-enforcer-ignore");
}

function isScannable(filePath: string): boolean {
  return SCANNABLE_EXTS.has(path.extname(filePath).toLowerCase());
}

// ── Line/col helpers ──────────────────────────────────────────────────────────

function lineColOf(content: string, index: number): { line: number; col: number } {
  const before = content.slice(0, index);
  const line   = (before.match(/\n/g) ?? []).length + 1;
  const col    = index - before.lastIndexOf("\n");
  return { line, col };
}

function extractContext(content: string, index: number, len: number): string {
  const start = Math.max(0, index - 30);
  const end   = Math.min(content.length, index + len + 30);
  return content.slice(start, end).replace(/\n/g, "↵").trim();
}

// ── File scanner ──────────────────────────────────────────────────────────────

/**
 * Scan a single file for sovereignty violations.
 * When called with only one argument the repo root is inferred as the
 * directory containing the file (useful for pre-commit / github-guard hooks).
 */
export function scanFile(filePath: string, root?: string): Finding[] {
  const effectiveRoot = root ?? path.dirname(filePath);
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  if (hasIgnoreComment(content)) return [];

  const rel = path.relative(effectiveRoot, filePath).replace(/\\/g, "/");
  const ext = path.extname(filePath).toLowerCase();
  const findings: Finding[] = [];

  // ── 1. Detect ethers/web3 imports in JS/TS/JSON ─────────────────────────
  if ([".ts", ".tsx", ".js", ".mjs", ".cjs"].includes(ext)) {
    const importHits = detectImports(content);
    for (const hit of importHits) {
      const idx = content.indexOf(hit.match);
      if (idx === -1) continue;
      const { line, col } = lineColOf(content, idx);
      findings.push({
        kind:       "EthImport",
        severity:   hit.severity as Severity,
        file:       rel,
        line,
        col,
        match:      hit.match,
        suggestion: hit.suggestion,
        context:    extractContext(content, idx, hit.match.length),
      });
    }
  }

  // ── 2. Detect eth_* RPC method strings ──────────────────────────────────
  const rpcHits = detectRpcCalls(content);
  for (const hit of rpcHits) {
    const idx = content.indexOf(hit.match);
    if (idx === -1) continue;
    const { line, col } = lineColOf(content, idx);
    findings.push({
      kind:       "RpcCall",
      severity:   "HIGH",
      file:       rel,
      line,
      col,
      match:      hit.match,
      suggestion: hit.suggestion,
      context:    extractContext(content, idx, hit.match.length),
    });
  }

  // ── 3. Detect ERC standards and OZ imports in Solidity ──────────────────
  if (ext === ".sol") {
    const solHits = detectSolidityStandards(content);
    for (const hit of solHits) {
      const idx = content.indexOf(hit.match);
      if (idx === -1) continue;
      const { line, col } = lineColOf(content, idx);
      findings.push({
        kind:       "SolStandard",
        severity:   "HIGH",
        file:       rel,
        line,
        col,
        match:      hit.match,
        suggestion: hit.suggestion,
        context:    extractContext(content, idx, hit.match.length),
      });
    }
  }

  return findings;
}

// ── Recursive directory walker ─────────────────────────────────────────────────

function walk(
  dir: string,
  root: string,
  stats: { scanned: number; exempt: number },
  findings: Finding[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (isHardSkip(entry.name)) continue;
      if (isExempt(full, root))   { stats.exempt++; continue; }
      walk(full, root, stats, findings);
      continue;
    }

    if (!entry.isFile() || !isScannable(full)) continue;
    if (isExempt(full, root)) { stats.exempt++; continue; }

    stats.scanned++;
    const fileFindings = scanFile(full, root);
    findings.push(...fileFindings);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scan the entire repository rooted at `root` for Ethereum dependency violations.
 * Returns a {@link ScanReport} with all findings and summary statistics.
 */
export function scanRepo(root: string): ScanReport {
  const t0      = Date.now();
  const stats   = { scanned: 0, exempt: 0 };
  const findings: Finding[] = [];

  walk(root, root, stats, findings);

  return {
    root,
    scannedAt:    new Date().toISOString(),
    scanned:      stats.scanned,
    scannedFiles: stats.scanned,
    exempt:       stats.exempt,
    findings,
    durationMs:   Date.now() - t0,
    ok:           findings.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH").length === 0,
  };
}
