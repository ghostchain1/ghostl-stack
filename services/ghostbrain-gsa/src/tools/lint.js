/**
 * @file src/tools/lint.js
 * @description ESLint + docker compose config lint wrappers.
 */
import { runTool } from './runner.js';
import { config } from '../config.js';

/**
 * Run ESLint across the repo (read-only).
 * @param {{ cwd?: string, format?: string }} [opts]
 */
export async function eslint(opts = {}) {
  const cwd = opts.cwd ?? config.repoRoot;
  const fmt = opts.format ?? 'json';
  const result = await runTool('eslint', 'npx', ['--no', 'eslint', '--format', fmt, '--max-warnings=0', '.'], { cwd });
  let findings = [];
  if (fmt === 'json') {
    try {
      const parsed = JSON.parse(result.stdout);
      findings = parsed.flatMap(f => (f.messages ?? []).map(m => ({
        file:     f.filePath,
        line:     m.line,
        severity: m.severity === 2 ? 'error' : 'warning',
        message:  m.message,
        ruleId:   m.ruleId,
      })));
    } catch { /* ignore parse errors */ }
  }
  return { ok: result.exitCode === 0, findings, raw: result.stdout, durationMs: result.durationMs };
}

/**
 * Validate all docker-compose YAML files using `docker compose config`.
 * @param {string[]} [files]
 * @param {string}   [cwd]
 */
export async function composeLint(files = [], cwd = config.repoRoot) {
  // Discover compose files if none specified
  const targets = files.length > 0 ? files : ['docker-compose.yml'];
  const results = [];
  for (const f of targets) {
    const r = await runTool('compose-lint', 'docker', ['compose', '-f', f, 'config', '--quiet'], { cwd });
    results.push({ file: f, ok: r.ok, error: r.stderr });
  }
  return { ok: results.every(r => r.ok), results };
}
