/**
 * @file src/tools/runner.js
 * @description Shared process runner for all tool wrappers.
 * All tools are READ-ONLY by default (no write side effects except log files).
 * Tool output is collected and returned; never shell-expanded from user input.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

/**
 * @typedef {Object} ToolResult
 * @property {boolean} ok
 * @property {string}  stdout
 * @property {string}  stderr
 * @property {number}  exitCode
 * @property {string}  tool
 * @property {number}  durationMs
 */

/**
 * Run a tool command in the repo root directory.
 * Commands must be allowlisted strings — no shell expansion.
 * @param {string}   tool   - tool name for labeling
 * @param {string}   cmd    - executable (absolute or resolved from PATH)
 * @param {string[]} args   - argument array (never interpolated from user input)
 * @param {object}   [opts]
 * @param {string}   [opts.cwd]  - working directory (default: config.repoRoot)
 * @param {number}   [opts.timeoutMs]
 * @returns {Promise<ToolResult>}
 */
export async function runTool(tool, cmd, args, opts = {}) {
  const cwd     = opts.cwd     ?? config.repoRoot;
  const timeout = opts.timeoutMs ?? config.scanTimeoutMs;
  const start   = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env, CI: '1' },
    });
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0, tool, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ok:         err.code === 0 || err.code === null,
      stdout:     err.stdout ?? '',
      stderr:     err.stderr ?? String(err),
      exitCode:   typeof err.code === 'number' ? err.code : -1,
      tool,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Parse npm audit JSON output into a list of findings.
 * @param {string} json
 * @returns {{ severity: string, name: string, description: string }[]}
 */
export function parseNpmAuditJson(json) {
  try {
    const parsed = JSON.parse(json);
    const vulns = parsed.vulnerabilities ?? {};
    return Object.entries(vulns).map(([name, v]) => ({
      severity: v.severity,
      name,
      description: (v.via?.[0]?.title ?? v.via?.[0] ?? 'unknown'),
    }));
  } catch { return []; }
}
