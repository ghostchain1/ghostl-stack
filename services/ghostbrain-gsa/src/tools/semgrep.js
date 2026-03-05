/**
 * @file src/tools/semgrep.js
 * @description Semgrep security scan wrapper.
 * Runs semgrep in read-only mode. If semgrep is not installed, returns a skipped result.
 */
import { runTool } from './runner.js';
import { config } from '../config.js';

/**
 * Run semgrep with auto ruleset (read-only).
 * @param {{ cwd?: string, config?: string }} [opts]
 * @returns {Promise<{ ok: boolean, findings: object[], skipped?: boolean, durationMs: number }>}
 */
export async function semgrepScan(opts = {}) {
  const cwd    = opts.cwd ?? config.repoRoot;
  const ruleConfig = opts.config ?? 'auto';
  const args = ['--config', ruleConfig, '--json', '--quiet', '.'];

  // Graceful fallback if semgrep not available
  const which = await runTool('which-semgrep', 'which', ['semgrep'], { cwd, timeoutMs: 3_000 });
  if (!which.ok) {
    return { ok: true, findings: [], skipped: true, durationMs: 0, reason: 'semgrep not installed' };
  }

  const result = await runTool('semgrep', 'semgrep', args, { cwd, timeoutMs: 180_000 });
  let findings = [];
  try {
    const parsed = JSON.parse(result.stdout);
    findings = (parsed.results ?? []).map(r => ({
      file:     r.path,
      line:     r.start?.line,
      severity: r.extra?.severity ?? 'INFO',
      message:  r.extra?.message ?? r.check_id,
      ruleId:   r.check_id,
    }));
  } catch { /* non-JSON output */ }

  const critical = findings.filter(f => ['ERROR', 'WARNING'].includes(f.severity));
  return { ok: critical.length === 0, findings, durationMs: result.durationMs };
}
