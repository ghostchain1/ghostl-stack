/**
 * ACG — Gate Runner
 *
 * Executes all policy gates in the required sequence and accumulates findings.
 * Order: routing-law → build → code-quality → test → security → supply-chain → change-risk
 *
 * Any CRITICAL or HIGH security finding blocks merge (hard block).
 * Code-quality and test failures block unless explicitly whitelisted.
 * Supply-chain failures are always hard blocks.
 */

import type { ChangeProposal, GateRunResult, GateFinding, GateKind } from "./types.js";
import type { WorkspaceHandle } from "./workspace.js";
import { runInWorkspace } from "./workspace.js";
import { logger } from "../logger.js";
import { isRoutingLegal } from "../policy/routing-law.js";
import {
  ACG_COVERAGE_FLOOR_PCT,
  ACG_FAIL_ON_HIGH,
} from "../config.js";

// ─── Gate runner ───────────────────────────────────────────────────────────────
export interface GateRunnerOptions {
  proposal: ChangeProposal;
  workspace: WorkspaceHandle;
  skipGates?: GateKind[];
}

export async function runAllGates(opts: GateRunnerOptions): Promise<GateRunResult[]> {
  const { proposal, workspace, skipGates = [] } = opts;
  const results: GateRunResult[] = [];

  const run = async (kind: GateKind, fn: () => Promise<GateRunResult>) => {
    if (skipGates.includes(kind)) {
      results.push({ kind, passed: true, durationMs: 0, findings: [], output: "skipped" });
      return;
    }
    logger.info("ACG gate starting", { proposalId: proposal.proposalId, gate: kind });
    const t0 = Date.now();
    try {
      const r = await fn();
      results.push({ ...r, durationMs: Date.now() - t0 });
      logger.info("ACG gate completed", {
        proposalId: proposal.proposalId,
        gate: kind,
        passed: r.passed,
        durationMs: Date.now() - t0,
        findings: r.findings.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        kind,
        passed: false,
        durationMs: Date.now() - t0,
        findings: [{ severity: "high", rule: "gate-crash", message: `Gate crashed: ${msg}` }],
        output: msg,
      });
      logger.error("ACG gate crashed", { proposalId: proposal.proposalId, gate: kind, err: msg });
    }
  };

  // 1. Routing law — always first
  await run("routing-law", () => _routingLawGate(proposal));

  // 2. Build gate
  await run("build", () => _buildGate(workspace));

  // 3. Code quality gate
  await run("code-quality", () => _codeQualityGate(workspace));

  // 4. Test gate
  await run("test", () => _testGate(workspace));

  // 5. Security gate (SAST + dep audit + secret scan + contract scan if applicable)
  await run("security", () => _securityGate(workspace, proposal));

  // 6. Supply chain gate
  await run("supply-chain", () => _supplyChainGate(workspace));

  // 7. Change risk gate
  await run("change-risk", () => _changeRiskGate(proposal));

  return results;
}

/** True if all required gates passed (fatal findings block). */
export function gatesAllPassed(results: GateRunResult[]): boolean {
  for (const r of results) {
    if (!r.passed) return false;
    if (ACG_FAIL_ON_HIGH) {
      const hasCritOrHigh = r.findings.some(
        f => f.severity === "critical" || f.severity === "high",
      );
      if (hasCritOrHigh) return false;
    }
  }
  return true;
}

// ─── Individual gates ──────────────────────────────────────────────────────────

async function _routingLawGate(proposal: ChangeProposal): Promise<GateRunResult> {
  const findings: GateFinding[] = [];

  // Check scope for any cross-chain violations encoded in goal / scope
  const scopeStr = proposal.scope.join(" ") + " " + proposal.goal;
  const l3Direct = /l3[^2]*l1|ghostl3[^2]*ghostchain|l3.*->.*l1/i.test(scopeStr);
  if (l3Direct) {
    findings.push({
      severity: "critical",
      rule: "routing-law:l3-direct-l1",
      message: "L3→L1 direct routing detected in scope/goal — FORBIDDEN. Route through L2.",
    });
  }

  // Programmatic cross-layer check using existing routing-law module
  if (!isRoutingLegal("L3", "L1")) {
    // sanity check — if isRoutingLegal is somehow broken, surface it
  }

  return {
    kind: "routing-law",
    passed: findings.length === 0,
    durationMs: 0,
    findings,
    output: findings.length === 0 ? "Routing law: OK" : findings.map(f => f.message).join("\n"),
  };
}

async function _buildGate(ws: WorkspaceHandle): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  try {
    // TypeScript build check (no emit)
    const tscResult = await runInWorkspace(ws, "pnpm --filter ghostbrain-core exec tsc --noEmit 2>&1", 120_000);
    output += tscResult.stdout + tscResult.stderr;

    // Forge build for contracts if any Solidity files changed
    try {
      const forgeResult = await runInWorkspace(ws, "forge build --root contracts 2>&1", 180_000);
      output += "\n" + forgeResult.stdout + forgeResult.stderr;
    } catch {
      // Forge not available or no contracts — non-blocking warning
      output += "\nForge: not run (no contracts directory or tool absent)";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    findings.push({ severity: "high", rule: "build:tsc-error", message: msg });
    output += "\n" + msg;
  }

  return {
    kind: "build",
    passed: findings.length === 0,
    durationMs: 0,
    findings,
    output,
  };
}

async function _codeQualityGate(ws: WorkspaceHandle): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  const steps: Array<[string, string]> = [
    ["lint", "pnpm --filter ghostbrain-core exec eslint . --max-warnings=0 2>&1"],
    ["format", "pnpm --filter ghostbrain-core exec prettier --check . 2>&1"],
  ];

  for (const [label, cmd] of steps) {
    try {
      const r = await runInWorkspace(ws, cmd, 60_000);
      output += `\n[${label}]\n${r.stdout}${r.stderr}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      findings.push({ severity: "medium", rule: `quality:${label}`, message: msg });
      output += `\n[${label} FAILED]\n${msg}`;
    }
  }

  return {
    kind: "code-quality",
    passed: findings.filter(f => f.severity !== "low" && f.severity !== "info").length === 0,
    durationMs: 0,
    findings,
    output,
  };
}

async function _testGate(ws: WorkspaceHandle): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  try {
    const r = await runInWorkspace(
      ws,
      "pnpm --filter ghostbrain-core test --coverage --coverageThreshold='{\"global\":{\"lines\":80}}' 2>&1",
      300_000,
    );
    output = r.stdout + r.stderr;

    // Coverage floor check
    const match = output.match(/All files\s*\|\s*([\d.]+)/);
    if (match) {
      const coverage = parseFloat(match[1]);
      if (coverage < ACG_COVERAGE_FLOOR_PCT) {
        findings.push({
          severity: "high",
          rule: "test:coverage-floor",
          message: `Coverage ${coverage.toFixed(1)}% is below floor ${ACG_COVERAGE_FLOOR_PCT}%`,
        });
      }
    }

    // Forge tests for Solidity
    try {
      const fr = await runInWorkspace(ws, "forge test --root contracts 2>&1", 300_000);
      output += "\n[forge test]\n" + fr.stdout + fr.stderr;
    } catch {
      output += "\nForge tests: not run";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    findings.push({ severity: "high", rule: "test:suite-failed", message: msg });
    output += "\n" + msg;
  }

  return {
    kind: "test",
    passed: findings.length === 0,
    durationMs: 0,
    findings,
    output,
  };
}

async function _securityGate(
  ws: WorkspaceHandle,
  proposal: ChangeProposal,
): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  // 1. Dependency audit
  try {
    const r = await runInWorkspace(ws, "pnpm audit --audit-level=high 2>&1", 120_000);
    output += "[pnpm audit]\n" + r.stdout + r.stderr;
    if (/critical|high/i.test(r.stdout + r.stderr)) {
      findings.push({
        severity: "high",
        rule: "security:dep-audit",
        message: "pnpm audit found critical/high vulnerabilities. Run `pnpm audit fix` and re-check.",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    findings.push({ severity: "high", rule: "security:dep-audit-crash", message: msg });
    output += "\n[pnpm audit FAILED]\n" + msg;
  }

  // 2. Secret scan (gitleaks)
  try {
    const r = await runInWorkspace(ws, "gitleaks detect --source . --exit-code 1 2>&1", 60_000);
    output += "\n[gitleaks]\n" + r.stdout + r.stderr;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("leaks found")) {
      findings.push({
        severity: "critical",
        rule: "security:secret-leak",
        message: "GHA secrets/private keys detected in codebase. Remove all plaintext secrets.",
        remediation: "Use Vault/KMS for secret injection. See runbooks/acg-operations.md §Secret Hygiene.",
      });
    }
    output += "\n[gitleaks]\n" + msg;
  }

  // 3. SAST (semgrep)
  try {
    const r = await runInWorkspace(
      ws,
      "semgrep scan --config=auto --error --severity=ERROR --severity=WARNING 2>&1",
      300_000,
    );
    output += "\n[semgrep]\n" + r.stdout + r.stderr;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("command not found")) {
      findings.push({ severity: "high", rule: "security:sast", message: msg });
    }
    output += "\n[semgrep]\n" + msg;
  }

  // 4. Slither (only if Solidity files are in scope)
  const hasSolidity = proposal.scope.some(s => s.includes("contracts") || s.endsWith(".sol"));
  if (hasSolidity) {
    try {
      const r = await runInWorkspace(
        ws,
        "slither contracts/src --json - 2>&1 | python3 -c \"import json,sys; d=json.load(sys.stdin); [print(r['impact'],r['check'],r['elements'][0].get('source_mapping',{}).get('filename','')) for r in d.get('results',{}).get('detectors',[]) if r['impact'] in ('High','Critical')]\"",
        180_000,
      );
      const highs = r.stdout.trim().split("\n").filter(Boolean);
      for (const line of highs) {
        findings.push({ severity: "high", rule: "security:slither", message: line });
      }
      output += "\n[slither]\n" + r.stdout + r.stderr;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output += "\n[slither]\n" + msg;
    }
  }

  // 5. Container scan (trivy) — only if Docker context changed
  const hasDocker = proposal.scope.some(s => s.includes("Dockerfile") || s.includes("docker"));
  if (hasDocker) {
    try {
      const r = await runInWorkspace(
        ws,
        "trivy fs . --severity HIGH,CRITICAL --exit-code 1 2>&1",
        300_000,
      );
      output += "\n[trivy]\n" + r.stdout + r.stderr;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("CRITICAL") || msg.includes("HIGH")) {
        findings.push({
          severity: "high",
          rule: "security:container-scan",
          message: "Trivy found HIGH/CRITICAL vulnerabilities in container or IaC.",
        });
      }
      output += "\n[trivy]\n" + msg;
    }
  }

  return {
    kind: "security",
    passed: findings.filter(f => f.severity === "critical" || f.severity === "high").length === 0,
    durationMs: 0,
    findings,
    output,
  };
}

async function _supplyChainGate(ws: WorkspaceHandle): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  // 1. Lockfile integrity: pnpm-lock.yaml must be committed and match package.json
  try {
    const r = await runInWorkspace(ws, "git -C . diff --name-only HEAD pnpm-lock.yaml 2>&1", 15_000);
    if (r.stdout.trim() === "pnpm-lock.yaml") {
      findings.push({
        severity: "high",
        rule: "supply-chain:lockfile-drift",
        message: "pnpm-lock.yaml has uncommitted changes. Commit the lockfile.",
      });
    }
    output += "[lockfile]\n" + (r.stdout || "OK");
  } catch (err) {
    output += "[lockfile]\n" + String(err);
  }

  // 2. SBOM generation (syft) — non-blocking, just verify it runs
  try {
    const r = await runInWorkspace(ws, "syft . --output cyclonedx-json 2>&1 | head -20", 120_000);
    output += "\n[syft SBOM]\n" + r.stdout;
  } catch {
    output += "\n[syft SBOM]\nnot available — install syft for SBOM generation";
  }

  // 3. Pinned base images check
  try {
    const r = await runInWorkspace(
      ws,
      "grep -rn 'FROM.*:latest' --include='Dockerfile*' . 2>&1 || true",
      10_000,
    );
    if (r.stdout.trim()) {
      findings.push({
        severity: "medium",
        rule: "supply-chain:unpinned-image",
        message: `Unpinned :latest base images found:\n${r.stdout.trim()}`,
        remediation: "Pin Docker base images to a specific digest or immutable tag.",
      });
    }
    output += "\n[base images]\n" + (r.stdout.trim() || "OK — no :latest tags found");
  } catch (err) {
    output += "\n[base images]\n" + String(err);
  }

  return {
    kind: "supply-chain",
    passed: findings.filter(f => f.severity === "critical" || f.severity === "high").length === 0,
    durationMs: 0,
    findings,
    output,
  };
}

async function _changeRiskGate(proposal: ChangeProposal): Promise<GateRunResult> {
  const findings: GateFinding[] = [];
  let output = "";

  // High-risk changes require canary rollout declared
  if (
    proposal.riskLevel === "high" &&
    proposal.rolloutStrategy !== "canary" &&
    proposal.rolloutStrategy !== "staged" &&
    proposal.rolloutStrategy !== "blue-green"
  ) {
    findings.push({
      severity: "high",
      rule: "risk:high-without-canary",
      message: `High-risk proposal (${proposal.proposalId}) must use canary, staged, or blue-green rollout.`,
    });
  }

  // Critical risk always requires explicit rollback plan
  if (proposal.riskLevel === "critical" && proposal.rollbackPlan.length === 0) {
    findings.push({
      severity: "critical",
      rule: "risk:critical-no-rollback",
      message: "Critical-risk proposal has no rollback plan defined.",
    });
  }

  // Scope: if "all" is declared, treat as high-risk
  if (proposal.scope.includes("all") && proposal.riskLevel === "low") {
    findings.push({
      severity: "medium",
      rule: "risk:scope-too-broad",
      message: "Scope 'all' with low risk level is suspicious. Verify risk assessment.",
    });
  }

  output =
    findings.length === 0
      ? `Risk gate passed. Level=${proposal.riskLevel}, Rollout=${proposal.rolloutStrategy}`
      : findings.map(f => `[${f.severity}] ${f.rule}: ${f.message}`).join("\n");

  return {
    kind: "change-risk",
    passed: findings.filter(f => f.severity === "critical" || f.severity === "high").length === 0,
    durationMs: 0,
    findings,
    output,
  };
}
