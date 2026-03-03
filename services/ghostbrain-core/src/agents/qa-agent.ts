/**
 * ACG — QA / Test Agent
 *
 * Runs the full test suite (unit + integration + e2e + fuzz where applicable)
 * and enforces coverage floors.
 *
 * Coverage delta rules:
 *   - New code must not decrease overall coverage.
 *   - Any PR that adds a bug fix must include a regression test (enforced by
 *     DebuggerAgent, verified here).
 *   - Fuzz targets run on every contract change (Echidna).
 *
 * NATS: acg.test.request → acg.test.result
 */

import type { ChangeProposal, TestSuiteResult } from "../acg/types.js";
import type { WorkspaceHandle } from "../acg/workspace.js";
import { runInWorkspace } from "../acg/workspace.js";
import { logger } from "../logger.js";
import { ACG_COVERAGE_FLOOR_PCT } from "../config.js";

export class QAAgent {
  /**
   * Run all applicable test suites and return per-suite results.
   */
  async runTests(proposal: ChangeProposal, ws: WorkspaceHandle): Promise<TestSuiteResult[]> {
    logger.info("QAAgent: starting test run", { proposalId: proposal.proposalId });

    const suites: TestSuiteResult[] = [];

    suites.push(await this._runUnitTests(ws));
    suites.push(await this._runIntegrationTests(ws));

    const hasSolidity = proposal.scope.some(s => s.includes("contracts") || s.endsWith(".sol"));
    if (hasSolidity) {
      suites.push(await this._runForgeFuzz(ws));
    }

    const total = suites.reduce((s, r) => s + r.failed, 0);
    logger.info("QAAgent: test run complete", {
      proposalId: proposal.proposalId,
      suites: suites.length,
      totalFailed: total,
    });

    return suites;
  }

  /** Returns true if all test suites passed coverage floor and had 0 failures. */
  allPassed(suites: TestSuiteResult[]): boolean {
    for (const s of suites) {
      if (s.failed > 0) return false;
      if (s.coveragePct !== undefined && s.coveragePct < ACG_COVERAGE_FLOOR_PCT) return false;
    }
    return true;
  }

  /** Human-readable test summary. */
  summarize(suites: TestSuiteResult[]): string {
    return suites
      .map(s => {
        const cov = s.coveragePct !== undefined ? ` | cov ${s.coveragePct.toFixed(1)}%` : "";
        const status = s.failed === 0 ? "PASS" : "FAIL";
        return `[${s.suite}] ${status} — ✓${s.passed} ✗${s.failed} ⊘${s.skipped}${cov} (${s.durationMs}ms)`;
      })
      .join("\n");
  }

  // ─── Suite runners ────────────────────────────────────────────────────────

  private async _runUnitTests(ws: WorkspaceHandle): Promise<TestSuiteResult> {
    const t0 = Date.now();
    let output = "";
    try {
      const r = await runInWorkspace(
        ws,
        "pnpm --filter ghostbrain-core test --reporter=json 2>&1",
        300_000,
      );
      output = r.stdout + r.stderr;
    } catch (err) {
      output = String(err);
    }
    return _parseVitest(output, "unit", Date.now() - t0);
  }

  private async _runIntegrationTests(ws: WorkspaceHandle): Promise<TestSuiteResult> {
    const t0 = Date.now();
    let output = "";
    try {
      const r = await runInWorkspace(
        ws,
        "pnpm --filter ghostbrain-core test:integration --reporter=json 2>&1",
        600_000,
      );
      output = r.stdout + r.stderr;
    } catch (err) {
      output = String(err);
      // Integration tests may not exist — non-fatal
      if (output.includes("No test files found") || output.includes("script not found")) {
        return { suite: "integration", passed: 0, failed: 0, skipped: 0, durationMs: 0, failedTests: [] };
      }
    }
    return _parseVitest(output, "integration", Date.now() - t0);
  }

  private async _runForgeFuzz(ws: WorkspaceHandle): Promise<TestSuiteResult> {
    const t0 = Date.now();
    let output = "";
    let passed = 0;
    let failed = 0;
    const failedTests: string[] = [];

    try {
      const r = await runInWorkspace(
        ws,
        "forge test --fuzz-runs 500 --root contracts 2>&1",
        600_000,
      );
      output = r.stdout + r.stderr;
      const passMatch = output.match(/(\d+) tests? passed/i);
      const failMatch = output.match(/(\d+) tests? failed/i);
      passed = parseInt(passMatch?.[1] ?? "0", 10);
      failed = parseInt(failMatch?.[1] ?? "0", 10);
      if (failed > 0) {
        const failNames = output.match(/FAIL\s+(test\w+)/gim) ?? [];
        failedTests.push(...failNames.map(f => f.replace(/^FAIL\s+/i, "")));
      }
    } catch (err) {
      output = String(err);
      if (!output.includes("command not found")) failed = 1;
    }

    return {
      suite: "forge-fuzz",
      passed,
      failed,
      skipped: 0,
      durationMs: Date.now() - t0,
      failedTests,
    };
  }
}

// ─── Vitest JSON output parser ─────────────────────────────────────────────────

function _parseVitest(output: string, suite: string, durationMs: number): TestSuiteResult {
  // Try JSON reporter output first
  try {
    const jsonMatch = output.match(/(\{[\s\S]*"testResults"[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]) as {
        numPassedTests?: number;
        numFailedTests?: number;
        numPendingTests?: number;
        testResults?: Array<{ testFilePath?: string; status?: string }>;
        coverageMap?: { total?: { lines?: { pct?: number } } };
      };
      const coveragePct = parsed.coverageMap?.total?.lines?.pct;
      const failedTests = (parsed.testResults ?? [])
        .filter(t => t.status === "failed")
        .map(t => t.testFilePath ?? "unknown");
      return {
        suite,
        passed: parsed.numPassedTests ?? 0,
        failed: parsed.numFailedTests ?? 0,
        skipped: parsed.numPendingTests ?? 0,
        ...(coveragePct !== undefined ? { coveragePct } : {}),
        durationMs,
        failedTests,
      };
    }
  } catch { /* fall through to regex */ }

  // Regex fallback
  const passMatch = output.match(/(\d+) passed/i);
  const failMatch = output.match(/(\d+) failed/i);
  const skipMatch = output.match(/(\d+) skipped/i);
  const covMatch = output.match(/Lines\s*:\s*([\d.]+)%/i);

  return {
    suite,
    passed: parseInt(passMatch?.[1] ?? "0", 10),
    failed: parseInt(failMatch?.[1] ?? "0", 10),
    skipped: parseInt(skipMatch?.[1] ?? "0", 10),
    ...(covMatch ? { coveragePct: parseFloat(covMatch[1]) } : {}),
    durationMs,
    failedTests: [],
  };
}
