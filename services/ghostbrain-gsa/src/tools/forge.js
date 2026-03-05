/**
 * @file src/tools/forge.js
 * @description Foundry forge test runner wrapper.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runTool } from './runner.js';
import { config } from '../config.js';

/**
 * Run forge test (read-only — no state mutation).
 * @param {{ match?: string, cwd?: string }} [opts]
 * @returns {Promise<{ ok: boolean, output: string, durationMs: number }>}
 */
export async function forgeTest(opts = {}) {
  const cwd = opts.cwd ?? join(config.repoRoot, 'contracts');
  if (!existsSync(cwd)) return { ok: true, output: 'contracts/ not found — skipping forge', durationMs: 0 };

  const args = ['test', '--no-match-coverage', '-q'];
  if (opts.match) args.push('--match-test', opts.match);

  const result = await runTool('forge-test', 'forge', args, { cwd, timeoutMs: 180_000 });
  return { ok: result.ok, output: result.stdout + result.stderr, durationMs: result.durationMs };
}

/**
 * Run forge build only (faster than full test suite for syntax check).
 * @param {string} [cwd]
 */
export async function forgeBuild(cwd = join(config.repoRoot, 'contracts')) {
  if (!existsSync(cwd)) return { ok: true, output: 'contracts/ not found', durationMs: 0 };
  const result = await runTool('forge-build', 'forge', ['build', '-q'], { cwd });
  return { ok: result.ok, output: result.stdout + result.stderr, durationMs: result.durationMs };
}
