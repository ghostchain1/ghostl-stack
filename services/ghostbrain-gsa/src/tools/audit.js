/**
 * @file src/tools/audit.js
 * @description npm audit + supply-chain scan tool wrapper.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runTool, parseNpmAuditJson } from './runner.js';
import { config } from '../config.js';

/**
 * Run npm audit in the repo root and return structured findings.
 * @param {{ cwd?: string }} [opts]
 * @returns {Promise<{ ok: boolean, findings: object[], raw: string }>}
 */
export async function npmAudit(opts = {}) {
  const cwd = opts.cwd ?? config.repoRoot;
  const result = await runTool('npm-audit', 'npm', ['audit', '--json', '--audit-level=moderate'], { cwd });
  const findings = parseNpmAuditJson(result.stdout);
  // Treat as ok when no HIGH/CRITICAL findings (moderate is informational)
  const ok = !findings.some(f => f.severity === 'high' || f.severity === 'critical');
  return { ok, findings, raw: result.stdout, durationMs: result.durationMs };
}

/**
 * Verify that package-lock.json exists (deterministic install enforcement).
 * @param {string} [cwd]
 */
export function checkDeterministicInstall(cwd = config.repoRoot) {
  const hasPnpmLock = existsSync(join(cwd, 'pnpm-lock.yaml'));
  const hasNpmLock  = existsSync(join(cwd, 'package-lock.json'));
  return {
    ok: hasPnpmLock || hasNpmLock,
    reason: 'No package-lock.json or pnpm-lock.yaml found (required for deterministic builds)',
  };
}
