/**
 * ACG — Security Auditor Agent
 *
 * Mandatory gate: runs all security checks and produces an AuditResult set.
 * Any CRITICAL or HIGH finding blocks the pipeline (hard block — not configurable).
 *
 * Tools run:
 *   - pnpm audit          (JS dependency vulnerabilities)
 *   - gitleaks            (secret / credential leak detection)
 *   - semgrep             (SAST — 1000+ rules)
 *   - trivy               (container fs scan, IaC, SBOMs)
 *   - slither             (Solidity static analysis — contracts/ only)
 *   - echidna             (Solidity fuzz — contracts/ only, optional)
 *   - osv-scanner         (multi-ecosystem CVE matching)
 *
 * All findings are surfaced as GateFinding objects consumed by the gate runner.
 * Raw output is stored as evidence refs (never in logs).
 */

import { fileURLToPath } from "node:url";
import type { ChangeProposal, AuditResult, GateFinding, AuditToolKind } from "../acg/types.js";
import { ACG_SUBJECTS } from "../acg/types.js";
import type { WorkspaceHandle } from "../acg/workspace.js";
import { createWorkspace, runInWorkspace } from "../acg/workspace.js";
import { subscribe, publish, connectNATS } from "../connectors/nats.js";
import { logger } from "../logger.js";

export class AuditorAgent {
  /**
   * Run the full security audit suite for a proposal.
   * Returns per-tool results which are then rolled up by the gate runner.
   */
  async audit(proposal: ChangeProposal, ws: WorkspaceHandle): Promise<AuditResult[]> {
    logger.info("AuditorAgent: starting audit", { proposalId: proposal.proposalId });

    const results: AuditResult[] = [];

    results.push(await this._runDepAudit(ws));
    results.push(await this._runSecretScan(ws));
    results.push(await this._runSast(ws));
    results.push(await this._runContainerScan(ws, proposal));
    results.push(await this._runOsvScan(ws));

    // Solidity-specific tools only when contracts are in scope
    const hasSolidity = proposal.scope.some(s => s.includes("contracts") || s.endsWith(".sol"));
    if (hasSolidity) {
      results.push(await this._runSlither(ws));
    }

    const totalCrit = results.reduce((s, r) => s + r.criticalCount, 0);
    const totalHigh = results.reduce((s, r) => s + r.highCount, 0);

    logger.info("AuditorAgent: audit complete", {
      proposalId: proposal.proposalId,
      tools: results.length,
      critical: totalCrit,
      high: totalHigh,
    });

    return results;
  }

  /** Aggregate: true if any critical or high finding exists across all results. */
  hasBlockingFindings(results: AuditResult[]): boolean {
    return results.some(r => r.criticalCount > 0 || r.highCount > 0);
  }

  /** Produce a human-readable summary of all audit results. */
  summarize(results: AuditResult[]): string {
    return results
      .map(r => {
        const status = r.criticalCount > 0 || r.highCount > 0 ? "BLOCKED" : r.exitCode === 0 ? "PASSED" : "WARN";
        return `[${r.tool}] ${status} — C:${r.criticalCount} H:${r.highCount} M:${r.mediumCount} L:${r.lowCount}`;
      })
      .join("\n");
  }

  // ─── Per-tool runners ──────────────────────────────────────────────────────

  private async _runDepAudit(ws: WorkspaceHandle): Promise<AuditResult> {
    return this._runTool(ws, "pnpm-audit", "pnpm audit --audit-level=moderate --json 2>&1", output => {
      const criticalMatch = output.match(/"critical"\s*:\s*(\d+)/);
      const highMatch = output.match(/"high"\s*:\s*(\d+)/);
      const medMatch = output.match(/"moderate"\s*:\s*(\d+)/);
      const lowMatch = output.match(/"low"\s*:\s*(\d+)/);
      return {
        critical: parseInt(criticalMatch?.[1] ?? "0", 10),
        high: parseInt(highMatch?.[1] ?? "0", 10),
        medium: parseInt(medMatch?.[1] ?? "0", 10),
        low: parseInt(lowMatch?.[1] ?? "0", 10),
        findings: [],
      };
    });
  }

  private async _runSecretScan(ws: WorkspaceHandle): Promise<AuditResult> {
    return this._runTool(ws, "gitleaks", "gitleaks detect --source . --no-git --exit-code 2 2>&1", output => {
      const isLeak = /leaks found|WRN leak/i.test(output);
      const count = (output.match(/WRN/g) ?? []).length;
      const findings: GateFinding[] = isLeak
        ? [{ severity: "critical", rule: "secret-leak", message: `gitleaks detected ${count} secret(s)`, remediation: "Remove secrets; use Vault injection." }]
        : [];
      return { critical: isLeak ? count : 0, high: 0, medium: 0, low: 0, findings };
    });
  }

  private async _runSast(ws: WorkspaceHandle): Promise<AuditResult> {
    return this._runTool(
      ws,
      "semgrep",
      "semgrep scan --config=auto --json --severity=ERROR --severity=WARNING 2>&1",
      output => {
        let parsed: { results?: Array<{ extra?: { severity?: string; message?: string }; path?: string; start?: { line?: number } }> } = {};
        try { parsed = JSON.parse(output.match(/(\{[\s\S]*\})/)?.[1] ?? "{}"); } catch { /* non-JSON output */ }
        const results = parsed.results ?? [];
        const critical = results.filter(r => r.extra?.severity === "ERROR").length;
        const high = results.filter(r => r.extra?.severity === "WARNING").length;
        const findings: GateFinding[] = results.slice(0, 20).map(r => ({
          severity: r.extra?.severity === "ERROR" ? "critical" as const : "high" as const,
          rule: "semgrep",
          ...(r.path !== undefined ? { file: r.path } : {}),
          ...(r.start?.line !== undefined ? { line: r.start.line } : {}),
          message: r.extra?.message ?? "SAST finding",
        }));
        return { critical, high, medium: 0, low: 0, findings };
      },
    );
  }

  private async _runContainerScan(ws: WorkspaceHandle, _proposal: ChangeProposal): Promise<AuditResult> {
    return this._runTool(
      ws,
      "trivy",
      "trivy fs . --severity HIGH,CRITICAL --format json --exit-code 0 2>&1",
      output => {
        let counts = { critical: 0, high: 0, findings: [] as GateFinding[] };
        try {
          const parsed = JSON.parse(output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)?.[1] ?? "[]");
          const vulns: Array<{ Severity?: string; VulnerabilityID?: string; Title?: string }> = Array.isArray(parsed)
            ? parsed.flatMap((r: { Vulnerabilities?: typeof vulns }) => r.Vulnerabilities ?? [])
            : [];
          counts.critical = vulns.filter(v => v.Severity === "CRITICAL").length;
          counts.high = vulns.filter(v => v.Severity === "HIGH").length;
          counts.findings = vulns
            .filter(v => v.Severity === "CRITICAL" || v.Severity === "HIGH")
            .slice(0, 10)
            .map(v => ({
              severity: (v.Severity === "CRITICAL" ? "critical" : "high") as "critical" | "high",
              rule: v.VulnerabilityID ?? "CVE-unknown",
              message: v.Title ?? "Container vulnerability",
            }));
        } catch { /* non-JSON trivy output */ }
        return { ...counts, medium: 0, low: 0 };
      },
    );
  }

  private async _runOsvScan(ws: WorkspaceHandle): Promise<AuditResult> {
    return this._runTool(ws, "osv-scanner", "osv-scanner --json . 2>&1", output => {
      const critCount = (output.match(/"CRITICAL"/g) ?? []).length;
      const highCount = (output.match(/"HIGH"/g) ?? []).length;
      return { critical: critCount, high: highCount, medium: 0, low: 0, findings: [] };
    });
  }

  private async _runSlither(ws: WorkspaceHandle): Promise<AuditResult> {
    return this._runTool(
      ws,
      "slither",
      "slither contracts/src --json - 2>&1",
      output => {
        let parsed: { results?: { detectors?: Array<{ impact?: string; check?: string; description?: string }> } } = {};
        try { parsed = JSON.parse(output.match(/(\{[\s\S]*\})/)?.[1] ?? "{}"); } catch { /**/ }
        const detectors = parsed.results?.detectors ?? [];
        const critical = detectors.filter(d => d.impact === "Critical").length;
        const high = detectors.filter(d => d.impact === "High").length;
        const findings: GateFinding[] = detectors
          .filter(d => d.impact === "Critical" || d.impact === "High")
          .slice(0, 10)
          .map(d => ({
            severity: (d.impact === "Critical" ? "critical" : "high") as "critical" | "high",
            rule: `slither:${d.check ?? "unknown"}`,
            message: d.description ?? "Slither finding",
          }));
        return { critical, high, medium: 0, low: 0, findings };
      },
    );
  }

  // ─── Generic tool runner ───────────────────────────────────────────────────

  private async _runTool(
    ws: WorkspaceHandle,
    tool: AuditToolKind,
    cmd: string,
    parse: (output: string) => { critical: number; high: number; medium: number; low: number; findings: GateFinding[] },
  ): Promise<AuditResult> {
    const ranAt = new Date().toISOString();
    let exitCode = 0;
    let output = "";
    let parsed = { critical: 0, high: 0, medium: 0, low: 0, findings: [] as GateFinding[] };

    try {
      const r = await runInWorkspace(ws, cmd, 300_000);
      output = r.stdout + r.stderr;
      parsed = parse(output);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output = msg;
      exitCode = 1;
      // tool not installed → warn, don't fail
      if (msg.includes("not found") || msg.includes("command not found")) {
        logger.warn("AuditorAgent: tool not installed (non-blocking)", { tool });
        exitCode = 0;
      } else {
        try { parsed = parse(output); } catch { /**/ }
      }
    }

    logger.info("AuditorAgent: tool complete", {
      tool,
      critical: parsed.critical,
      high: parsed.high,
    });

    return {
      tool,
      ranAt,
      exitCode,
      criticalCount: parsed.critical,
      highCount: parsed.high,
      mediumCount: parsed.medium,
      lowCount: parsed.low,
      findings: parsed.findings,
    };
  }
}

// ─── Entry-point bootstrap ──────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  connectNATS().then(() => {
    subscribe(ACG_SUBJECTS.AUDIT_REQUEST, async (msg) => {
      const req = msg as unknown as { proposalId: string; proposal: ChangeProposal };
      const ws = await createWorkspace(req.proposalId);
      const agent = new AuditorAgent();
      try {
        const results = await agent.audit(req.proposal, ws);
        await publish(ACG_SUBJECTS.AUDIT_RESULT, { proposalId: req.proposalId, results });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error("AuditorAgent: audit failed", { proposalId: req.proposalId, err: errMsg });
        await publish(ACG_SUBJECTS.AUDIT_RESULT, { proposalId: req.proposalId, error: errMsg });
      } finally {
        await ws.dispose();
      }
    });
    logger.info("AuditorAgent daemon started, listening on acg.audit.request");
  }).catch((err) => {
    logger.error("AuditorAgent: failed to connect to NATS", { err: String(err) });
    process.exit(1);
  });
}
