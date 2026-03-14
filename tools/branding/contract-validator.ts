#!/usr/bin/env node
/**
 * @file tools/branding/contract-validator.ts
 * @description GhostChain Smart Contract Brand Validator.
 *
 * Validates all Solidity contracts enforce Ghost token naming and chain identity.
 * Integrates with the 13-pattern rule set in @ghostchain/brand-enforcer.
 *
 * Checks:
 *   - Token contracts must use "Ghost" / "GST" — not "Ethereum" / "ETH"
 *   - Chain identity references must be "GhostChain" — not "Ethereum"
 *   - Native token SYMBOL must not be "ETH"
 *   - "ether" keyword used as unit must be flagged (GST_UNIT preferred)
 *   - eth_ RPC strings must not appear in non-compat contract code
 *   - Bridge / L1-interop contracts are allowlisted for legitimate ETH references
 *
 * Run:
 *   node --experimental-strip-types tools/branding/contract-validator.ts
 *   node --experimental-strip-types tools/branding/contract-validator.ts --json
 *   pnpm brand:contracts
 *
 * Exit codes:
 *   0  All contracts pass
 *   1  CRITICAL or HIGH violations found
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface ContractRule {
  id: string;
  severity: Severity;
  description: string;
  test: (content: string, filePath: string) => { matched: boolean; context?: string };
  bridgeExempt: boolean;
}

interface ContractViolation {
  file: string;
  rule: ContractRule;
  context?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../..");

const CONTRACT_DIR = path.join(ROOT, "contracts");
const IS_JSON = process.argv.includes("--json");

// ---------------------------------------------------------------------------
// Bridge/adapter paths — legitimate ETH references expected
// ---------------------------------------------------------------------------

const BRIDGE_PATTERNS = [
  /\bbridge\b/i,         // bridge/ directory or bridge-named file (word boundary)
  /Bridge[A-Z]/,         // CamelCase: BridgeEchidna, BridgeAdapter, etc.
  /\badapter\b/i,
  /\bwrapped.?eth\b|\bweth\b/i,
  /\bcross.?chain\b/i,
  /\bl1.?interop\b/i,
  /\/lib\//,             // forge-std, OZ, and other vendored libs
  /\/formal\//,          // fuzzing/formal verification files — test harness values only
  /\/constitutional\//,  // brand invariant definition files legitimately reference forbidden terms
  /BrandingInvariant/,   // the brand enforcement contract itself defines forbidden strings
  /GhostBrainIntegration/, // AI integration tests that test Ethereum detection
  /GhostIdentityConstitution/, // identity constitution tests reference what they guard against
  /\/ghostcain\//,       // ghostcain sub-project (rebranded OZ fork — uses Solidity unit keyword in mocks/tests)
];

function isBridgePath(filePath: string): boolean {
  const rel = path.relative(ROOT, filePath);
  return BRIDGE_PATTERNS.some((p) => p.test(rel));
}

// ---------------------------------------------------------------------------
// Contract violation rules
// ---------------------------------------------------------------------------

const RULES: ContractRule[] = [
  {
    id: "CV-001",
    severity: "CRITICAL",
    description: 'Token symbol "ETH" in symbol() or SYMBOL constant — must be "GST"',
    bridgeExempt: true,
    test: (content) => {
      const match = content.match(/\bsymbol\s*\(\s*\)\s*(?:public|external)?.*?returns.*?"ETH"/s)
        ?? content.match(/\bSYMBOL\s*=\s*"ETH"/);
      return { matched: !!match, context: match?.[0]?.trim().slice(0, 100) };
    },
  },
  {
    id: "CV-002",
    severity: "CRITICAL",
    description: 'Token name "Ethereum" in name() — must be "Ghost"',
    bridgeExempt: true,
    test: (content) => {
      const match = content.match(/\bname\s*\(\s*\)\s*(?:public|external)?.*?returns.*?"Ethereum"/s)
        ?? content.match(/\bNAME\s*=\s*"Ethereum"/);
      return { matched: !!match, context: match?.[0]?.trim().slice(0, 100) };
    },
  },
  {
    id: "CV-003",
    severity: "HIGH",
    description: '"Ethereum" chain name string literal — must be "GhostChain"',
    bridgeExempt: true,   // constitutional + branding invariant contracts define forbidden terms
    test: (content) => {
      const match = content.match(/"Ethereum"/);
      return { matched: !!match, context: match?.[0] };
    },
  },
  {
    id: "CV-004",
    severity: "HIGH",
    description: '"ether" unit keyword — use GST_UNIT (1e18) instead of the Ether denomination',
    bridgeExempt: true,
    test: (content) => {
      // Matches: 1 ether, 0.1 ether, (value) ether — but not "toEther", "gsetter", etc.
      const match = content.match(/\b\d[\d.]*\s+ether\b|\)\s+ether\b/);
      return { matched: !!match, context: match?.[0] };
    },
  },
  {
    id: "CV-005",
    severity: "HIGH",
    description: 'eth_ RPC method string literal in contract code — use ghost_ namespace',
    bridgeExempt: true,
    test: (content) => {
      const match = content.match(/"eth_[a-zA-Z]+"/);
      return { matched: !!match, context: match?.[0] };
    },
  },
  {
    id: "CV-006",
    severity: "MEDIUM",
    description: 'Missing Ghost branding — contract has no "Ghost" or "GST" reference',
    bridgeExempt: true,
    test: (content, filePath) => {
      // Only check non-library, non-interface Solidity files
      const isLibOrInterface = /\b(?:library|interface)\s+\w/.test(content);
      if (isLibOrInterface) return { matched: false };
      // Accept compound names (GhostChain, GhostToken, GhostDNS, etc.) — no trailing \b
      const hasGhost = /Ghost/.test(content) || /\bGST\b/.test(content);
      return { matched: !hasGhost };
    },
  },
  {
    id: "CV-007",
    severity: "MEDIUM",
    description: 'chainId 1 (Ethereum mainnet) without ghost-chainid-ignore annotation',
    bridgeExempt: false,
    test: (content) => {
      // Matches: chainId = 1, chainId: 1, == 1 (chainId context) but not ghost-chainid-ignore
      const match = content.match(/\bchainId\s*[=:]==?\s*1\b(?!.*ghost-chainid-ignore)/);
      return { matched: !!match, context: match?.[0] };
    },
  },
  {
    id: "CV-008",
    severity: "LOW",
    description: '"Etherscan" URL in contract — use GhostScan URL',
    bridgeExempt: false,
    test: (content) => {
      const match = content.match(/etherscan\.io/i);
      return { matched: !!match, context: match?.[0] };
    },
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function validateContract(filePath: string, violations: ContractViolation[]): void {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  const bridge = isBridgePath(filePath);

  for (const rule of RULES) {
    if (rule.bridgeExempt && bridge) continue;

    // Skip lines with explicit ignore annotation
    const { matched, context } = rule.test(content, filePath);
    if (matched) {
      violations.push({
        file: path.relative(ROOT, filePath),
        rule,
        context,
      });
    }
  }
}

function walk(dir: string, violations: ContractViolation[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip vendored libraries and build output
      if (["node_modules", "artifacts", "cache", "out", "crytic-export"].includes(entry.name)) continue;
      walk(full, violations);
    } else if (entry.isFile() && entry.name.endsWith(".sol")) {
      validateContract(full, violations);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  if (!fs.existsSync(CONTRACT_DIR)) {
    process.stderr.write(`Contract directory not found: ${CONTRACT_DIR}\n`);
    process.exit(2);
  }

  const violations: ContractViolation[] = [];
  walk(CONTRACT_DIR, violations);

  if (IS_JSON) {
    process.stdout.write(JSON.stringify({ violations }, null, 2) + "\n");
    const fatal = violations.some((v) => v.rule.severity === "CRITICAL" || v.rule.severity === "HIGH");
    process.exit(fatal ? 1 : 0);
  }

  const GRN  = "\x1b[32m";
  const RED  = "\x1b[31m";
  const YLW  = "\x1b[33m";
  const CYN  = "\x1b[36m";
  const GRY  = "\x1b[90m";
  const BOLD = "\x1b[1m";
  const RESET= "\x1b[0m";

  const severityColor: Record<Severity, string> = {
    CRITICAL: RED, HIGH: YLW, MEDIUM: CYN, LOW: GRY,
  };

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   GhostChain Contract Brand Validator                ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (violations.length === 0) {
    console.log(`${GRN}✔  All contracts pass GhostChain branding validation.${RESET}\n`);
    process.exit(0);
  }

  // Group by file
  const byFile = new Map<string, ContractViolation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  for (const [file, viols] of byFile) {
    console.log(`  ${BOLD}${file}${RESET}`);
    for (const v of viols) {
      const sc = severityColor[v.rule.severity];
      console.log(`    ${sc}[${v.rule.id}] ${v.rule.severity}${RESET}  ${v.rule.description}`);
      if (v.context) console.log(`    ${GRY}> ${v.context}${RESET}`);
    }
    console.log();
  }

  const fatal = violations.filter(
    (v) => v.rule.severity === "CRITICAL" || v.rule.severity === "HIGH"
  );
  console.log(`  Total: ${violations.length} violation(s) — ${fatal.length} blocking (CRITICAL/HIGH)\n`);

  process.exit(fatal.length > 0 ? 1 : 0);
}

run();
