/**
 * GhostChain Autonomous Contract Engine — Controller
 *
 * Orchestrates the full scan → audit → generate → sync pipeline:
 *
 *   1. Scan contracts/src for all .sol files
 *   2. Parse each file with the AST parser
 *   3. Detect missing required functions (per contract role)
 *   4. Inject compilable stubs before the closing brace (safe injection)
 *   5. Detect branding violations and report/fix them
 *   6. Sync Forge ABIs → contracts/deployments/abi/
 *   7. Generate Foundry test stubs for every added function
 *
 * Safe by default:
 *   - Set DRY_RUN=false  to actually write changes to disk.
 *   - Set BRANDING_FIX=true to apply branding rewrites (default: report only).
 *   - Set ABI_SYNC=true to sync Forge artifacts (requires a prior forge build).
 *
 * Usage:
 *   tsx src/index.ts             # dry-run
 *   DRY_RUN=false tsx src/index.ts   # write stubs + tests
 *   DRY_RUN=false BRANDING_FIX=true tsx src/index.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { scanContracts } from "./scanner.js";
import { parseContract } from "./ast-parser.js";
import {
  REQUIRED_FUNCTIONS,
  type ContractRole,
  detectMissingFunctions,
  generateFunction,
  injectFunctions,
} from "./function-generator.js";
import { detectBrandingViolations, applyBrandingRewrites } from "./branding-rewriter.js";
import { syncABIFromForge } from "./abi-sync.js";
import { generateFoundryTestFile } from "./test-generator.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const CONTRACTS_SRC = path.join(REPO_ROOT, "contracts", "src");
const CONTRACTS_OUT = path.join(REPO_ROOT, "contracts", "out");
const ABI_DEST = path.join(REPO_ROOT, "contracts", "deployments", "abi");
const TEST_DEST = path.join(REPO_ROOT, "contracts", "test", "foundry", "generated");

const DRY_RUN = process.env["DRY_RUN"] !== "false";
const BRANDING_FIX = process.env["BRANDING_FIX"] === "true";
const ABI_SYNC = process.env["ABI_SYNC"] === "true";

// Map base file name → contract role for required-function auditing.
const CONTRACT_ROLE_MAP: Record<string, ContractRole> = {
  "GRC20":                      "GRC20",
  "GRC721":                     "GRC721",
  "GRC1155":                    "GRC1155",
  "GhostChainGovernor":         "GhostChainGovernor",
  "SovereignTreasuryEngine":    "SovereignTreasuryEngine",
  "StandardBridge":             "StandardBridge",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string): void {
  process.stdout.write(`[ghost-contract-engine] ${msg}\n`);
}

function writeFile(filePath: string, content: string): void {
  if (DRY_RUN) {
    log(`  DRY-RUN: would write ${path.relative(REPO_ROOT, filePath)}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  log(`  Wrote ${path.relative(REPO_ROOT, filePath)}`);
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

interface EngineReport {
  scanned: number;
  withMissingFunctions: number;
  totalFunctionsGenerated: number;
  brandingViolations: number;
  abisSynced: number;
  testFilesGenerated: number;
}

async function run(): Promise<void> {
  log("────────────────────────────────────────────────────────");
  log("  GhostChain Autonomous Contract Engine");
  log(`  Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "WRITE"}`);
  log(`  Branding fix: ${BRANDING_FIX}`);
  log(`  ABI sync: ${ABI_SYNC}`);
  log("────────────────────────────────────────────────────────");

  const report: EngineReport = {
    scanned: 0,
    withMissingFunctions: 0,
    totalFunctionsGenerated: 0,
    brandingViolations: 0,
    abisSynced: 0,
    testFilesGenerated: 0,
  };

  const contracts = scanContracts(CONTRACTS_SRC);
  report.scanned = contracts.length;
  log(`Scanned ${contracts.length} Solidity files.\n`);

  for (const contract of contracts) {
    const { filePath, relativePath, baseName } = contract;

    // ── Parse ──────────────────────────────────────────────────────────────
    let source: string;
    try {
      source = fs.readFileSync(filePath, "utf8");
    } catch {
      log(`  SKIP (unreadable): ${relativePath}`);
      continue;
    }

    const parsed = parseContract(source, relativePath);
    if (parsed === null) {
      // Parse errors already printed by parseContract.
      continue;
    }

    // ── Branding audit ─────────────────────────────────────────────────────
    const violations = detectBrandingViolations(source, relativePath);
    if (violations.length > 0) {
      report.brandingViolations += violations.length;
      for (const v of violations) {
        log(`  BRANDING  ${relativePath}:${v.line}  [${v.term}]  ${v.lineText}`);
      }
      if (BRANDING_FIX) {
        const fixed = applyBrandingRewrites(source);
        writeFile(filePath, fixed);
        source = fixed; // use fixed source for subsequent steps
      }
    }

    // ── Function audit ─────────────────────────────────────────────────────
    const role: ContractRole | undefined = CONTRACT_ROLE_MAP[baseName];
    if (role !== undefined) {
      const required = REQUIRED_FUNCTIONS[role];
      const missing = detectMissingFunctions(parsed, required);

      if (missing.length > 0) {
        report.withMissingFunctions++;
        report.totalFunctionsGenerated += missing.length;

        log(`  MISSING [${baseName}]: ${missing.join(", ")}`);

        const stubs = missing.map((fn) => generateFunction(fn));
        const patched = injectFunctions(source, stubs);
        writeFile(filePath, patched);

        // ── Test stub generation ─────────────────────────────────────────
        const testFile = generateFoundryTestFile({
          contractName: baseName,
          // Relative from test/foundry/generated/ to src/
          contractImportPath: `../../../src/${path.dirname(relativePath)}/${baseName}.sol`,
          functions: missing,
        });

        const testDest = path.join(TEST_DEST, `${baseName}.generated.t.sol`);
        writeFile(testDest, testFile);
        report.testFilesGenerated++;
      } else {
        log(`  OK   ${relativePath}`);
      }
    }

    // ── ABI sync ───────────────────────────────────────────────────────────
    if (ABI_SYNC) {
      const synced = syncABIFromForge(baseName, CONTRACTS_OUT, ABI_DEST);
      if (synced) {
        report.abisSynced++;
        log(`  ABI synced: ${baseName}`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log("\n────────────────────────────────────────────────────────");
  log("  Engine Report");
  log("────────────────────────────────────────────────────────");
  log(`  Files scanned:           ${report.scanned}`);
  log(`  Contracts with gaps:     ${report.withMissingFunctions}`);
  log(`  Functions generated:     ${report.totalFunctionsGenerated}`);
  log(`  Branding violations:     ${report.brandingViolations}`);
  log(`  ABIs synced:             ${report.abisSynced}`);
  log(`  Test stubs generated:    ${report.testFilesGenerated}`);

  if (DRY_RUN && (report.withMissingFunctions > 0 || report.brandingViolations > 0)) {
    log("\n  Run with DRY_RUN=false to apply changes.");
    process.exit(1); // Non-zero exit so CI can flag an audit failure.
  }

  log("\n  Done.");
}

run().catch((err) => {
  process.stderr.write(`[ghost-contract-engine] Fatal: ${String(err)}\n`);
  process.exit(1);
});
