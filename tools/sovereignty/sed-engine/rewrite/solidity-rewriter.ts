/**
 * @file tools/sovereignty/sed-engine/rewrite/solidity-rewriter.ts
 * @description Rewrites Ethereum contract-standard identifiers and OpenZeppelin
 *   import paths in Solidity (.sol) files to their Ghost sovereign equivalents.
 *
 * Replacements driven by rules/branding-map.json → solidityStandards section.
 */

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, "../rules");

const BRANDING_MAP = JSON.parse(fs.readFileSync(path.join(RULES_DIR, "branding-map.json"), "utf8"));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SolRewriteResult {
  filePath:  string;
  changed:   boolean;
  diff:      Array<{ line: number; before: string; after: string }>;
  written:   boolean;
}

// ── Rule tables ───────────────────────────────────────────────────────────────

const SOL_STANDARDS: Record<string, string> = BRANDING_MAP.solidityStandards ?? {};
const EXEMPT_PATTERNS: string[]             = BRANDING_MAP.exemptPatterns ?? [];

/**
 * Order matters: replace longer patterns first to avoid partial matches.
 * e.g. "@openzeppelin/contracts/token/ERC20" before "@openzeppelin/contracts"
 */
const SORTED_RULES = Object.entries(SOL_STANDARDS).sort(
  ([a], [b]) => b.length - a.length
);

// Compiled regex rules: each entry matches the LHS token inside Solidity source
const COMPILED_RULES: Array<{ fromPat: RegExp; to: string }> = SORTED_RULES.map(
  ([from, to]) => ({
    fromPat: new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    to,
  })
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExempt(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, "/");
  return EXEMPT_PATTERNS.some(p => norm.includes(p));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rewrite a single Solidity file. Returns diff and optionally writes in-place.
 */
export function rewriteSolFile(filePath: string, dryRun = false): SolRewriteResult {
  if (isExempt(filePath)) {
    return { filePath, changed: false, diff: [], written: false };
  }

  const original = fs.readFileSync(filePath, "utf8");
  const lines     = original.split("\n");
  const diffLines: Array<{ line: number; before: string; after: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    let current = lines[i]!;

    for (const { fromPat, to } of COMPILED_RULES) {
      fromPat.lastIndex = 0;
      const rewritten = current.replace(fromPat, to);
      if (rewritten !== current) {
        // Only record first diff per line (outermost replacement already captured)
        const alreadyRecorded = diffLines.some(d => d.line === i + 1);
        if (!alreadyRecorded) {
          diffLines.push({ line: i + 1, before: lines[i]!, after: rewritten });
        }
        current = rewritten;
      }
    }

    lines[i] = current;
  }

  if (diffLines.length === 0) {
    return { filePath, changed: false, diff: [], written: false };
  }

  const rewritten = lines.join("\n");
  let written = false;

  if (!dryRun) {
    fs.writeFileSync(filePath, rewritten, "utf8");
    written = true;
  }

  return { filePath, changed: true, diff: diffLines, written };
}

/**
 * Recursively rewrite all .sol files under `dir`.
 */
export function rewriteSolDir(dir: string, dryRun = false): SolRewriteResult[] {
  const results: SolRewriteResult[] = [];
  const SKIP = new Set(["node_modules", ".git", "lib", "cache", "out", "artifacts"]);

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
      } else if (entry.name.endsWith(".sol")) {
        results.push(rewriteSolFile(full, dryRun));
      }
    }
  }

  walk(dir);
  return results;
}
