/**
 * @file tools/sovereignty/sed-engine/enforcement/precommit-hook.ts
 * @description Git pre-commit hook — scans only the staged files for Ethereum
 *   dependency violations and blocks the commit if CRITICAL or HIGH issues are found.
 *
 * Installation:
 *   cp tools/sovereignty/sed-engine/enforcement/precommit-hook.ts .git/hooks/pre-commit
 *   # or add to your lint-staged / husky config:
 *   # "pre-commit": "node --experimental-strip-types tools/sovereignty/sed-engine/enforcement/precommit-hook.ts"
 *
 * Exit codes:
 *   0  — Clean (or only MEDIUM/LOW findings)
 *   1  — Blocking violations found
 */

import { execSync }     from "node:child_process";
import path             from "node:path";
import { fileURLToPath } from "node:url";
import { scanFile }     from "../scanner/repo-scanner.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, "../../../../..");

const BLOCKING = new Set(["CRITICAL", "HIGH"]);

const ANSI = {
  red:   "\x1b[31m",
  green: "\x1b[32m",
  bold:  "\x1b[1m",
  reset: "\x1b[0m",
  dim:   "\x1b[2m",
};
function c(k: keyof typeof ANSI, t: string) {
  return process.stdout.isTTY ? `${ANSI[k]}${t}${ANSI.reset}` : t;
}

// ── Get staged files ──────────────────────────────────────────────────────────

let staged: string[];
try {
  const out  = execSync("git diff --cached --name-only --diff-filter=ACM", {
    cwd: REPO_ROOT,
  }).toString();
  staged = out.split("\n").map(l => l.trim()).filter(Boolean);
} catch {
  // Not inside a git repo or git not available — silently pass
  process.exit(0);
}

if (staged.length === 0) {
  process.exit(0);
}

// ── Filter to scannable extensions ───────────────────────────────────────────

const SCANNABLE = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".sol"]);
const toScan    = staged
  .filter(f => SCANNABLE.has(path.extname(f)))
  .map(f => path.join(REPO_ROOT, f));

if (toScan.length === 0) {
  process.exit(0);
}

// ── Scan ─────────────────────────────────────────────────────────────────────

console.log(c("bold", "\n⚡ SED-Engine pre-commit check…"));

const allFindings = toScan.flatMap(f => {
  try {
    return scanFile(f);
  } catch {
    return [];
  }
});

const blocking = allFindings.filter(f => BLOCKING.has(f.severity));

if (blocking.length > 0) {
  console.log(c("red", `\n✗ Commit blocked — ${blocking.length} sovereignty violation(s):\n`));

  for (const f of blocking) {
    const rel = path.relative(REPO_ROOT, f.file);
    console.log(`  [${f.severity}] ${rel}:${f.line}:${f.col}`);
    console.log(`          ${c("red", f.match)}`);
    console.log(`          → ${f.suggestion}`);
    console.log();
  }

  console.log(c("dim", "  Fix with: npm run ghost:sovereignty:fix"));
  console.log(c("dim", "  Or add #sed-ignore comment to skip a specific line.\n"));
  process.exit(1);
}

const total = allFindings.length;
console.log(
  total === 0
    ? c("green", "  ✓ No sovereignty violations in staged files.\n")
    : `  ${total} MEDIUM/LOW findings (non-blocking). Run ghost:sovereignty:scan for full report.\n`
);

process.exit(0);
