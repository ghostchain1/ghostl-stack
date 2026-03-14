import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type TrivyResult = {
  ok: boolean;
  enabled: boolean;
  detail?: unknown;
  note?: string;
};

export async function runTrivySecretScan(opts: { enabled: boolean; repoRoot: string; configPath?: string }): Promise<TrivyResult> {
  if (!opts.enabled) return { ok: true, enabled: false, note: 'trivy scan disabled' };
  try {
    const args = [
      'fs',
      '--scanners',
      'secret',
      '--exit-code',
      '0',
      '--timeout',
      '2m',
      ...(opts.configPath ? ['--secret-config', opts.configPath] : []),
      opts.repoRoot
    ];
    const { stdout } = await execFileAsync('trivy', args, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, enabled: true, detail: { stdout: stdout.slice(0, 4000) } };
  } catch (e) {
    return { ok: false, enabled: true, note: e instanceof Error ? e.message : 'trivy_failed' };
  }
}

