/**
 * @file tools/sovereignty/sed-engine/rewrite/rpc-rewriter.ts
 * @description Rewrites hardcoded eth_* RPC method name strings in JS/TS/JSON
 *   source files to their Ghost sovereign equivalents (ghost_*).
 *
 * Mappings: rules/rpc-mapping.json → mappings section.
 * Exempt paths are NOT rewritten (ghost-sdk compat layer, bridge adapters, etc.)
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, "../rules");

const RPC_MAP_RAW = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "rpc-mapping.json"), "utf8"));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RpcRewriteResult {
  filePath: string;
  changed:  boolean;
  diff:     Array<{ line: number; before: string; after: string }>;
  written:  boolean;
}

// ── Rule tables ───────────────────────────────────────────────────────────────

const MAPPINGS: Record<string, string> = RPC_MAP_RAW.mappings ?? {};
const EXEMPT_PATHS: string[]           = RPC_MAP_RAW.exemptPaths ?? [];

// Build one regex that matches any eth_* key as a quoted/template literal
const ETH_METHODS = Object.keys(MAPPINGS);
const RPC_REGEX   = new RegExp(
  `(["'\`])(${ETH_METHODS.map(m => m.replace("_", "_")).join("|")})(["'\`])`,
  "g"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExempt(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return EXEMPT_PATHS.some(p => norm.includes(p));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rewrite all eth_* method string literals in a single file.
 */
export function rewriteRpcFile(filePath: string, dryRun = false): RpcRewriteResult {
  if (isExempt(filePath)) {
    return { filePath, changed: false, diff: [], written: false };
  }

  const original = fs.readFileSync(filePath, "utf8");
  const lines     = original.split("\n");
  const diffLines: Array<{ line: number; before: string; after: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const before = lines[i]!;
    RPC_REGEX.lastIndex = 0;

    const after = before.replace(
      RPC_REGEX,
      (_full, openQuote: string, method: string, closeQuote: string) => {
        const ghostMethod = MAPPINGS[method];
        return ghostMethod ? `${openQuote}${ghostMethod}${closeQuote}` : _full;
      }
    );

    if (after !== before) {
      diffLines.push({ line: i + 1, before, after });
      lines[i] = after;
    }
  }

  if (diffLines.length === 0) {
    return { filePath, changed: false, diff: [], written: false };
  }

  let written = false;
  if (!dryRun) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    written = true;
  }

  return { filePath, changed: true, diff: diffLines, written };
}

/**
 * Recursively rewrite all JS/TS/JSON files under `dir`.
 */
export function rewriteRpcDir(dir: string, dryRun = false): RpcRewriteResult[] {
  const results: RpcRewriteResult[] = [];
  const SKIP    = new Set(["node_modules", ".git", "dist", "out", "coverage", "cache"]);
  const EXTS    = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);

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
      } else if (EXTS.has(path.extname(entry.name))) {
        results.push(rewriteRpcFile(full, dryRun));
      }
    }
  }

  walk(dir);
  return results;
}
