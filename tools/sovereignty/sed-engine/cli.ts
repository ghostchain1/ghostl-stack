#!/usr/bin/env node
/**
 * @file tools/sovereignty/sed-engine/cli.ts
 * @description GhostStack SED-Engine CLI — Sovereign Ethereum Dependency Eliminator
 *
 * Commands:
 *   scan    [root] [--json]          Detect all Ethereum dependency violations
 *   enforce [root]                   Scan + exit 1 on CRITICAL/HIGH (CI gate)
 *   rewrite [root] [--dry-run]       Auto-rewrite JS/TS imports and RPC calls
 *   fix     [root]                   Alias for 'rewrite' (no --dry-run)
 *   report  [root] [--output <file>] Write full JSON report to a file
 *
 * Usage:
 *   node --experimental-strip-types tools/sovereignty/sed-engine/cli.ts scan
 *   node --experimental-strip-types tools/sovereignty/sed-engine/cli.ts enforce
 *   node --experimental-strip-types tools/sovereignty/sed-engine/cli.ts rewrite --dry-run
 *   node --experimental-strip-types tools/sovereignty/sed-engine/cli.ts report --output report.json
 */

import fs       from "node:fs";
import path     from "node:path";
import https    from "node:https";
import { fileURLToPath } from "node:url";

import { scanRepo }             from "./scanner/repo-scanner.ts";
import { buildDependencyGraph } from "./scanner/dependency-graph.ts";
import { rewriteJsDir }         from "./rewrite/js-rewriter.ts";
import { rewriteRpcDir }        from "./rewrite/rpc-rewriter.ts";
import { rewriteSolDir }        from "./rewrite/solidity-rewriter.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY;
const A = {
  reset:  "\x1b[0m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};
function c(col: keyof typeof A, text: string) {
  return USE_COLOR ? `${A[col]}${text}${A.reset}` : text;
}
function severityBadge(sev: string): string {
  if (sev === "CRITICAL") return c("red",    `[CRITICAL]`);
  if (sev === "HIGH")     return c("red",    `[HIGH]    `);
  if (sev === "MEDIUM")   return c("yellow", `[MEDIUM]  `);
  return                        c("dim",    `[LOW]     `);
}

// ── Argument parsing ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command  = argv[0] ?? "scan";
const positional = argv.filter(a => !a.startsWith("--"));
const rootArg    = positional[1] ?? null;
const flags      = new Set(argv.filter(a => a.startsWith("--")).map(a => a.toLowerCase()));
const flagValue  = (name: string) => {
  const idx = argv.indexOf(name);
  return idx !== -1 ? argv[idx + 1] ?? null : null;
};

const JSON_OUTPUT  = flags.has("--json");
const DRY_RUN      = flags.has("--dry-run");
const OUTPUT_FILE  = flagValue("--output");

// Resolve root: CLI arg → $REPO_ROOT env → monorepo root (5 levels up from cli.ts)
const DEFAULT_ROOT = path.resolve(__dirname, "../../../../..");
const root         = rootArg ? path.resolve(rootArg) : (process.env["REPO_ROOT"] ?? DEFAULT_ROOT);

const BLOCKING = new Set(["CRITICAL", "HIGH"]);

// ── GhostBrain integration ────────────────────────────────────────────────────

function postToGhostBrain(report: object): void {
  const url = process.env["GHOSTBRAIN_URL"];
  if (!url) return;

  try {
    const parsed  = new URL("/api/v1/signals", url);
    const json    = JSON.stringify({
      source:    "sed-engine",
      timestamp: new Date().toISOString(),
      data:      report,
    });
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port ? Number(parsed.port) : 443,
      path:     parsed.pathname,
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(json),
        "X-Ghost-Source": "sed-engine",
      },
    };
    const req = https.request(opts);
    req.on("error", () => { /* best-effort */ });
    req.write(json);
    req.end();
  } catch {
    // best-effort — never block CLI output
  }
}

// ── Command implementations ───────────────────────────────────────────────────

function cmdScan(): number {
  const report   = scanRepo(root);
  const depGraph = buildDependencyGraph(root);

  const allFindings = [
    ...report.findings,
    ...depGraph.violations.filter(v => !v.exempt).map(v => ({
      kind:       "ForbiddenDep" as const,
      severity:   v.severity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      file:       v.packageFile,
      line:       0,
      col:        0,
      match:      `"${v.dep}": "${v.version}"`,
      suggestion: `Replace with "${v.ghostEquivalent}"`,
      context:    `Workspace: ${v.workspaceName}${v.devOnly ? " (devDependency)" : ""}`,
    })),
  ];

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({ report, depGraph, allFindings }, null, 2) + "\n");
    postToGhostBrain({ summary: { findings: allFindings.length } });
    return 0;
  }

  console.log(c("bold", "\n⚡ SED-Engine Scan Report — GhostStack Sovereignty\n"));
  console.log(`  Root:     ${root}`);
  console.log(`  Scanned:  ${report.scanned} source files + ${depGraph.scannedManifests} package.json manifests`);
  console.log(`  Exempt:   ${report.exempt} paths skipped (compat layer)\n`);

  if (allFindings.length === 0) {
    console.log(c("green", "  ✓ No sovereignty violations found.\n"));
    return 0;
  }

  const byKind: Record<string, typeof allFindings> = {};
  for (const f of allFindings) {
    byKind[f.kind] = byKind[f.kind] ?? [];
    byKind[f.kind]!.push(f);
  }

  for (const [kind, findings] of Object.entries(byKind)) {
    console.log(c("cyan", c("bold", `  ${kind} (${findings.length})\n`)));
    for (const f of findings) {
      const loc = f.line > 0 ? `:${f.line}:${f.col}` : "";
      console.log(`  ${severityBadge(f.severity)}  ${f.file}${loc}`);
      console.log(`              match: ${c("red", f.match)}`);
      console.log(`              fix:   ${f.suggestion}`);
      if (f.context) console.log(c("dim", `              ctx:   ${f.context}`));
      console.log();
    }
  }

  const blocking = allFindings.filter(f => BLOCKING.has(f.severity));
  const total    = allFindings.length;

  console.log(`  Total: ${total} finding(s) — ${blocking.length} blocking (CRITICAL/HIGH)`);
  if (blocking.length > 0) {
    console.log(c("dim", `  Run: npm run ghost:sovereignty:fix  to apply automatic rewrites`));
  }
  console.log();

  postToGhostBrain({ summary: { findings: total, blocking: blocking.length } });
  return 0;   // scan itself always exits 0; enforce exits non-zero
}

function cmdEnforce(): number {
  const report   = scanRepo(root);
  const depGraph = buildDependencyGraph(root);
  const blocking = [
    ...report.findings.filter(f => BLOCKING.has(f.severity)),
    ...depGraph.violations.filter(v => !v.exempt && BLOCKING.has(v.severity)),
  ];

  if (blocking.length > 0) {
    console.error(c("red", c("bold", `\n✗ Sovereignty enforcement failed — ${blocking.length} CRITICAL/HIGH violation(s)\n`)));
    for (const f of blocking) {
      if ("file" in f && "line" in f) {
        // ScanFinding
        const sf = f as { file: string; line: number; col: number; match: string; suggestion: string; severity: string };
        console.error(`  [${sf.severity}] ${sf.file}:${sf.line}:${sf.col}`);
        console.error(`          ${sf.match}`);
        console.error(`       →  ${sf.suggestion}`);
      } else {
        // DepViolation
        const dv = f as { packageFile: string; dep: string; version: string; ghostEquivalent: string; severity: string };
        console.error(`  [${dv.severity}] ${dv.packageFile}`);
        console.error(`          "${dv.dep}": "${dv.version}"`);
        console.error(`       →  "${dv.ghostEquivalent}"`);
      }
      console.error();
    }
    postToGhostBrain({ enforce: "failed", blocking: blocking.length });
    return 1;
  }

  console.log(c("green", `\n✓ Sovereignty check passed — ${report.scanned} files clean.\n`));
  postToGhostBrain({ enforce: "passed" });
  return 0;
}

function cmdRewrite(dryRun: boolean): number {
  console.log(c("bold", `\n⚡ SED-Engine Rewrite${dryRun ? " (dry-run)" : ""}\n`));

  const jsResults  = rewriteJsDir(root, dryRun);
  const rpcResults = rewriteRpcDir(root, dryRun);
  const solResults = rewriteSolDir(root, dryRun);

  const changed = [
    ...jsResults.filter(r => r.changed),
    ...rpcResults.filter(r => r.changed),
    ...solResults.filter(r => r.changed),
  ];

  if (changed.length === 0) {
    console.log(c("green", "  ✓ Nothing to rewrite — all files already sovereign.\n"));
    return 0;
  }

  for (const r of changed) {
    const rel = path.relative(root, r.filePath);
    console.log(`  ${dryRun ? "(dry)" : "FIXED"} ${rel} — ${r.diff.length} line(s) changed`);
    if (dryRun) {
      for (const d of r.diff.slice(0, 5)) {
        console.log(c("red",   `    - ${d.before.trim()}`));
        console.log(c("green", `    + ${d.after.trim()}`));
      }
      if (r.diff.length > 5) console.log(c("dim", `    … ${r.diff.length - 5} more`));
    }
  }

  console.log(`\n  ${changed.length} file(s) ${dryRun ? "would be" : "were"} rewritten.\n`);
  return 0;
}

function cmdReport(): number {
  const report   = scanRepo(root);
  const depGraph = buildDependencyGraph(root);
  const full     = { scannedAt: report.scannedAt, root, report, depGraph };

  const json = JSON.stringify(full, null, 2);

  if (OUTPUT_FILE) {
    fs.writeFileSync(OUTPUT_FILE, json, "utf8");
    console.log(`Report written to: ${OUTPUT_FILE}`);
  } else {
    process.stdout.write(json + "\n");
  }

  postToGhostBrain(full);
  return 0;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const USAGE = `
${c("bold", "SED-Engine")} — GhostStack Sovereign Ethereum Dependency Eliminator

Usage:
  ${c("cyan", "scan")}    [root] [--json]          Detect violations (non-blocking exit)
  ${c("cyan", "enforce")} [root]                   CI gate: exit 1 on CRITICAL/HIGH
  ${c("cyan", "rewrite")} [root] [--dry-run]       Auto-rewrite to Ghost equivalents
  ${c("cyan", "fix")}     [root]                   Same as rewrite without --dry-run
  ${c("cyan", "report")}  [root] [--output <file>] Full JSON report
`;

let exitCode = 0;

switch (command) {
  case "scan":
    exitCode = cmdScan();
    break;
  case "enforce":
    exitCode = cmdEnforce();
    break;
  case "rewrite":
    exitCode = cmdRewrite(DRY_RUN);
    break;
  case "fix":
    exitCode = cmdRewrite(false);
    break;
  case "report":
    exitCode = cmdReport();
    break;
  case "--help":
  case "-h":
  case "help":
    console.log(USAGE);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    exitCode = 1;
}

process.exit(exitCode);
