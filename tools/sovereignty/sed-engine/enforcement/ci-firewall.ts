/**
 * @file tools/sovereignty/sed-engine/enforcement/ci-firewall.ts
 * @description CI enforcement gate — runs a full repository scan and exits with
 *   a non-zero status code if any CRITICAL or HIGH severity findings exist.
 *
 * Designed to run as a CI step:
 *   node --experimental-strip-types tools/sovereignty/sed-engine/enforcement/ci-firewall.ts [root]
 *
 * Exit codes:
 *   0  — No blocking violations found (MEDIUM/LOW only, or clean)
 *   1  — CRITICAL or HIGH violations found → build fails
 *   2  — Internal error (scan itself failed)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepo }          from "../scanner/repo-scanner.ts";
import { buildDependencyGraph } from "../scanner/dependency-graph.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const BLOCKING_SEVERITIES = new Set(["CRITICAL", "HIGH"]);

const ANSI = {
  reset:  "\x1b[0m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function c(color: keyof typeof ANSI, text: string): string {
  return process.stdout.isTTY ? `${ANSI[color]}${text}${ANSI.reset}` : text;
}

function severityColor(sev: string): string {
  if (sev === "CRITICAL") return c("red",    `[${sev}]`);
  if (sev === "HIGH")     return c("red",    `[${sev}]   `);
  if (sev === "MEDIUM")   return c("yellow", `[${sev}] `);
  return                         c("dim",    `[${sev}]    `);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const root = process.argv[2] ?? path.resolve(__dirname, "../../../../..");

console.log(c("bold", "\n⚡ SED-Engine CI Firewall — GhostStack Sovereignty Check"));
console.log(`   Scanning: ${root}\n`);

let exitCode = 0;

try {
  // 1. Source-code scan
  const report  = scanRepo(root);
  const depGraph = buildDependencyGraph(root);

  const allFindings = [
    ...report.findings,
    ...depGraph.violations.map(v => ({
      kind:       "ForbiddenDep" as const,
      severity:   v.severity,
      file:       v.packageFile,
      line:       0,
      col:        0,
      match:      `"${v.dep}": "${v.version}"`,
      suggestion: `Replace with "${v.ghostEquivalent}"`,
      context:    `Workspace: ${v.workspaceName}${v.devOnly ? " (devDependency)" : ""}${v.exempt ? " [EXEMPT]" : ""}`,
    })),
  ];

  const blocking = allFindings.filter(f => BLOCKING_SEVERITIES.has(f.severity) && !(f as {context?: string}).context?.includes("[EXEMPT]"));
  const warnings = allFindings.filter(f => !BLOCKING_SEVERITIES.has(f.severity));

  // Print blocking violations
  if (blocking.length > 0) {
    console.log(c("red", c("bold", `✗ ${blocking.length} BLOCKING violation(s) found:\n`)));
    for (const f of blocking) {
      const loc = f.line > 0 ? `:${f.line}:${f.col}` : "";
      console.log(`  ${severityColor(f.severity)}  ${f.file}${loc}`);
      console.log(`         match:  ${c("red", f.match)}`);
      console.log(`         fix:    ${f.suggestion}`);
      if (f.context) console.log(c("dim", `         ctx:    ${f.context}`));
      console.log();
    }
    exitCode = 1;
  }

  // Print warnings (non-blocking)
  if (warnings.length > 0) {
    console.log(c("yellow", `⚠  ${warnings.length} warning(s) (non-blocking):\n`));
    for (const f of warnings.slice(0, 20)) {   // cap at 20 in CI output
      const loc = f.line > 0 ? `:${f.line}:${f.col}` : "";
      console.log(`  ${severityColor(f.severity)}  ${f.file}${loc} — ${f.match}`);
    }
    if (warnings.length > 20) {
      console.log(c("dim", `  … and ${warnings.length - 20} more. Run 'ghost:sovereignty:scan' for full list.`));
    }
    console.log();
  }

  // Summary
  const scanned = report.scannedFiles + depGraph.scannedManifests;
  if (exitCode === 0) {
    console.log(c("green", `✓ Sovereignty check passed — ${scanned} files scanned, 0 blocking violations.`));
  } else {
    console.log(c("red", `✗ Sovereignty check FAILED — fix ${blocking.length} blocking violation(s) before merging.`));
    console.log(c("dim", `  Run: npm run ghost:sovereignty:fix  to apply automatic rewrites`));
  }

  console.log();

} catch (err) {
  console.error(c("red", "SED-Engine internal error:"), err);
  exitCode = 2;
}

process.exit(exitCode);
