/**
 * @file tools/sovereignty/sed-engine/rewrite/js-rewriter.ts
 * @description Rewrites Ethereum import statements and API references in JS/TS files
 *   to their Ghost sovereign equivalents.
 *
 * Supports:
 *   --dry-run  Print diff without writing
 *   auto-apply Write rewritten content in-place
 *
 * Uses rules/branding-map.json (imports & apiMappings sections).
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, "../rules");

const BRANDING_MAP   = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "branding-map.json"),  "utf8"));
const FORBIDDEN_DEPS = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "forbidden-deps.json"), "utf8"));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RewriteResult {
  filePath:   string;
  changed:    boolean;
  diff:       Array<{ line: number; before: string; after: string }>;
  written:    boolean;
}

// ── Rule tables ───────────────────────────────────────────────────────────────

/** Line-level import replacements keyed by exact "from" string pattern */
const IMPORT_REPLACEMENTS: Array<{ fromPat: RegExp; to: string; raw: string }> = [
  // ethers → @ghostchain/sdk
  {
    fromPat: /from\s+["']ethers["']/g,
    to:      'from "@ghostchain/sdk"',
    raw:     "ethers",
  },
  // web3 → @ghostchain/sdk
  {
    fromPat: /from\s+["']web3["']/g,
    to:      'from "@ghostchain/sdk"',
    raw:     "web3",
  },
  // require("ethers") → require("@ghostchain/sdk")
  {
    fromPat: /require\s*\(\s*["']ethers["']\s*\)/g,
    to:      'require("@ghostchain/sdk")',
    raw:     "ethers",
  },
  // require("web3") → require("@ghostchain/sdk")
  {
    fromPat: /require\s*\(\s*["']web3["']\s*\)/g,
    to:      'require("@ghostchain/sdk")',
    raw:     "web3",
  },
  // @ethersproject/* → @ghostchain/sdk
  {
    fromPat: /from\s+["']@ethersproject\/[^"']+["']/g,
    to:      'from "@ghostchain/sdk"',
    raw:     "@ethersproject",
  },
  // @openzeppelin/contracts/* → @ghostchain/contracts/*
  {
    fromPat: /from\s+["']@openzeppelin\/contracts\/([^"']+)["']/g,
    to:      'from "@ghostchain/contracts/$1"',
    raw:     "@openzeppelin/contracts",
  },
];

/** API-level identifier replacements */
const API_REPLACEMENTS: Array<{ fromPat: RegExp; to: string }> = Object.entries(
  (BRANDING_MAP.apiMappings ?? {}) as Record<string, string>
).map(([from, to]) => ({
  fromPat: new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
  to,
}));

const EXEMPT_PATTERNS: string[] = FORBIDDEN_DEPS.exemptPaths ?? [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExempt(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return EXEMPT_PATTERNS.some(p => norm.includes(p));
}

function rewriteLines(
  lines:  string[],
  rules:  Array<{ fromPat: RegExp; to: string; hasCapture?: boolean }>,
): Array<{ line: number; before: string; after: string }> {
  const diff: Array<{ line: number; before: string; after: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    let current = lines[i]!;

    for (const rule of rules) {
      rule.fromPat.lastIndex = 0;
      // Handle capture group references in 'to'
      const rewritten = current.replace(rule.fromPat, rule.to);
      if (rewritten !== current) {
        diff.push({ line: i + 1, before: current, after: rewritten });
        current = rewritten;
      }
    }

    lines[i] = current;
  }

  return diff;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rewrite a single JS/TS file.
 *
 * @param filePath  Absolute path to the source file
 * @param dryRun    When true, compute diff but do NOT write to disk
 */
export function rewriteJsFile(filePath: string, dryRun = false): RewriteResult {
  if (isExempt(filePath)) {
    return { filePath, changed: false, diff: [], written: false };
  }

  const original = fs.readFileSync(filePath, "utf8");
  const lines     = original.split("\n");

  const importDiff = rewriteLines(lines, IMPORT_REPLACEMENTS);
  const apiDiff    = rewriteLines(lines, API_REPLACEMENTS);
  const allDiff    = [...importDiff, ...apiDiff];

  if (allDiff.length === 0) {
    return { filePath, changed: false, diff: [], written: false };
  }

  const rewritten = lines.join("\n");
  let written = false;

  if (!dryRun) {
    fs.writeFileSync(filePath, rewritten, "utf8");
    written = true;
  }

  return { filePath, changed: true, diff: allDiff, written };
}

/**
 * Rewrite all JS/TS files under `dir` recursively.
 */
export function rewriteJsDir(dir: string, dryRun = false): RewriteResult[] {
  const results: RewriteResult[] = [];
  const SKIP = new Set(["node_modules", ".git", "dist", "out", "coverage", "cache"]);

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(full);
      } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        results.push(rewriteJsFile(full, dryRun));
      }
    }
  }

  walk(dir);
  return results;
}
