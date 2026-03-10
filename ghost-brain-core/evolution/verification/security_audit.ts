/**
 * GhostBrain Self-Evolution Engine — Security Audit
 *
 * Scans an EvolutionDiff (unified diff string) for forbidden patterns
 * before any staging or testing occurs.
 *
 * The audit operates on the diff text only — it never executes, evaluates,
 * or requires() any code.  It looks for patterns that, if applied, would
 * introduce security regressions into the codebase.
 *
 * Findings are classified as:
 *   "block" — the diff MUST NOT proceed (AuditReport.approved = false).
 *   "warn"  — the diff may proceed but the finding is surfaced to reviewers.
 *
 * The diff is APPROVED only if there are zero "block" findings.
 */

import { createHash } from "crypto";
import type { AuditReport, AuditFinding, EvolutionDiff } from "../types.js";

// ---------------------------------------------------------------------------
// Forbidden pattern definitions
// ---------------------------------------------------------------------------

interface ForbiddenPattern {
  severity:    "block" | "warn";
  /** Regex applied to individual diff addition lines (lines starting with '+'). */
  re:          RegExp;
  message:     string;
}

const PATTERNS: ForbiddenPattern[] = [

  // Shell injection vectors -------------------------------------------------
  {
    severity: "block",
    re:       /\bexec\s*\(/,
    message:  "exec() detected — use execFile() with a typed argument array instead",
  },
  {
    severity: "block",
    re:       /\bspawn\s*\([^)]*shell\s*:\s*true/,
    message:  "spawn() with shell:true detected — shell option must be false",
  },
  {
    severity: "block",
    re:       /\bshell\s*:\s*true/,
    message:  "shell:true option detected — always set shell:false",
  },
  {
    severity: "block",
    re:       /\beval\s*\(/,
    message:  "eval() detected — forbidden in this codebase",
  },
  {
    severity: "block",
    re:       /new\s+Function\s*\(/,
    message:  "new Function() detected — forbidden dynamic code execution",
  },
  {
    severity: "block",
    re:       /\bFunction\s*\(\s*["'`]/,
    message:  "Function() with string argument detected — forbidden",
  },

  // Dangerous file-system ops -----------------------------------------------
  {
    severity: "block",
    re:       /rm\s+-rf\b|rmdir\s+--force|\.rmSync\s*\(|fs\.unlinkSync/,
    message:  "destructive synchronous FS operation detected",
  },
  {
    severity: "block",
    re:       /writeFileSync\s*\(|appendFileSync\s*\(/,
    message:  "synchronous file write detected — use async writeFile/appendFile",
  },

  // Process manipulation ----------------------------------------------------
  {
    severity: "block",
    re:       /process\.exit\s*\(/,
    message:  "process.exit() detected — use graceful shutdown patterns",
  },
  {
    severity: "block",
    re:       /process\.env\s*\[|process\.env\.\w+\s*=/,
    message:  "process.env mutation detected — environment must not be modified at runtime",
  },

  // Hardcoded secrets -------------------------------------------------------
  {
    severity: "block",
    re:       /\b(private_?key|privatekey|secret_?key)\s*[:=]\s*["'`][0-9a-f]{40,}/i,
    message:  "possible hardcoded private key or secret detected",
  },
  {
    severity: "block",
    re:       /0x[0-9a-fA-F]{64}\b/,
    message:  "possible 32-byte hex literal (private key) detected — never hardcode secrets",
  },

  // Banned imports ----------------------------------------------------------
  {
    severity: "block",
    re:       /from\s+["']ethers["']|require\s*\(\s*["']ethers["']\s*\)/,
    message:  "ethers.js import detected — use ghost-sdk or ghost-sdk-core instead",
  },
  {
    severity: "block",
    re:       /from\s+["']web3["']|require\s*\(\s*["']web3["']\s*\)/,
    message:  "legacy web3 import detected — use ghost-sdk or ghost-sdk-core instead",
  },
  {
    severity: "block",
    re:       /from\s+["']@openzeppelin\/|require\s*\(\s*["']@openzeppelin\//,
    message:  "@openzeppelin direct import — use @ghostchain/* scoped packages",
  },

  // Banned RPC methods ------------------------------------------------------
  {
    severity: "block",
    re:       /["'`]eth_call["'`]|["'`]eth_sendTransaction["'`]|["'`]eth_getBalance["'`]/,
    message:  "eth_* RPC method detected — use ghost_* methods only",
  },
  {
    severity: "block",
    re:       /JsonRpcProvider|(?:Alch)emyProvider|(?:Infur)aProvider/,
    message:  "external RPC provider detected — route all RPC through ghost-sdk",
  },

  // Autonomous on-chain writes ----------------------------------------------
  {
    severity: "block",
    re:       /sendTransaction|signTransaction|broadcastTransaction/,
    message:  "autonomous transaction submission detected — all on-chain writes require the signing relay",
  },

  // Network calls to external services -------------------------------------
  {
    severity: "block",
    re:       /https?:\/\/(?!localhost|127\.0\.0\.1)/,
    message:  "hardcoded external URL detected — use env vars for all service URLs",
  },

  // Potential SSRF vectors --------------------------------------------------
  {
    severity: "block",
    re:       /fetch\s*\(\s*req\.|fetch\s*\(\s*request\./,
    message:  "user-controlled URL in fetch() — potential SSRF",
  },

  // Warn-only patterns ------------------------------------------------------
  {
    severity: "warn",
    re:       /console\.log/,
    message:  "console.log() added — consider using the structured logger",
  },
  {
    severity: "warn",
    re:       /TODO|FIXME|HACK/,
    message:  "TODO/FIXME/HACK marker added — must be resolved before merge",
  },
  {
    severity: "warn",
    re:       /@ts-ignore|@ts-nocheck/,
    message:  "@ts-ignore or @ts-nocheck added — address type error properly",
  },
  {
    severity: "warn",
    re:       /any\b/,
    message:  "TypeScript 'any' type added — use specific types instead",
  },
];

// ---------------------------------------------------------------------------
// SecurityAudit
// ---------------------------------------------------------------------------

export class SecurityAudit {
  /**
   * Scan an EvolutionDiff for forbidden patterns.
   * The diff hash is re-verified to detect tampering between generation
   * and audit time.
   */
  audit(diff: EvolutionDiff): AuditReport {
    const now = Date.now();

    // Verify the diff hash has not been tampered with.
    const recomputedHash = createHash("sha256")
      .update(diff.unifiedDiff)
      .digest("hex");

    if (recomputedHash !== diff.diffHash) {
      return {
        taskId:    diff.taskId,
        approved:  false,
        findings: [{
          severity: "block",
          pattern:  "diffHash mismatch",
          message:  `diff content does not match recorded hash — possible tampering. ` +
                    `Expected ${diff.diffHash}, got ${recomputedHash}`,
        }],
        auditedAt: now,
      };
    }

    const findings: AuditFinding[] = [];

    // Scan only addition lines (lines starting with '+' in unified diff format).
    // Context lines (' ') and removal lines ('-') are not added to the target.
    const lines = diff.unifiedDiff.split("\n");
    lines.forEach((line, idx) => {
      if (!line.startsWith("+") || line.startsWith("+++")) return;

      const content = line.slice(1); // strip the leading '+'
      for (const fp of PATTERNS) {
        if (fp.re.test(content)) {
          findings.push({
            severity: fp.severity,
            pattern:  fp.re.toString(),
            message:  fp.message,
            line:     idx + 1,
          });
        }
      }
    });

    const hasBlocker = findings.some(f => f.severity === "block");

    return {
      taskId:    diff.taskId,
      approved:  !hasBlocker,
      findings,
      auditedAt: now,
    };
  }
}
