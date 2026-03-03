// docker-manager.ts — Docker container lifecycle management via Docker socket or Docker host

import { exec }       from 'node:child_process';
import { promisify }  from 'node:util';
import { CFG }        from './config.js';
import { logger }     from './logger.js';
import type { ContainerInfo, ContainerState } from './types.js';

const execAsync = promisify(exec);

/** Build docker CLI command prefix */
function dockerCmd(args: string[]): string {
  const hostFlag = CFG.dockerHost
    ? `-H '${CFG.dockerHost}'`
    : CFG.dockerSocket
    ? `-H unix://${CFG.dockerSocket}`
    : '';
  return `docker ${hostFlag} ${args.join(' ')}`;
}

async function run(cmd: string, timeout = 20_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(cmd, { timeout });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(err) };
  }
}

function parseContainerState(state: string): ContainerState {
  const s = (state ?? '').toLowerCase();
  if (s === 'running')    return 'running';
  if (s === 'exited')     return 'exited';
  if (s === 'paused')     return 'paused';
  if (s === 'created')    return 'created';
  if (s === 'restarting') return 'restarting';
  if (s === 'dead')       return 'dead';
  if (s === 'removing')   return 'removing';
  return 'unknown';
}

/** Return all containers (running + stopped) */
export async function discoverContainers(): Promise<ContainerInfo[]> {
  const format = [
    '{{.ID}}',
    '{{.Names}}',
    '{{.Image}}',
    '{{.State}}',
    '{{.Status}}',
    '{{.Ports}}',
  ].join('\t');

  const cmd = dockerCmd(['ps', '-a', `--format="${format}"`]);
  const { stdout, stderr } = await run(cmd);

  if (stderr && !stdout) {
    logger.warn('Docker ps error', { stderr: stderr.slice(0, 200) });
    return [];
  }

  const containers: ContainerInfo[] = [];
  for (const line of stdout.trim().split('\n')) {
    if (!line.trim()) continue;
    // Strip leading/trailing quotes that the format string may add
    const clean = line.replace(/^"/, '').replace(/"$/, '');
    const [id, nameRaw, image, state, status, ports] = clean.split('\t');
    if (!id) continue;
    const name = (nameRaw ?? '').replace(/^\//, '');

    // Get restart count from inspect (best-effort)
    let restartCount = 0;
    const inspectCmd = dockerCmd(['inspect', '--format={{.RestartCount}}', id]);
    const { stdout: rc } = await run(inspectCmd, 5_000);
    const parsed = parseInt(rc.trim(), 10);
    if (!Number.isNaN(parsed)) restartCount = parsed;

    containers.push({
      id,
      name,
      image:        image ?? '',
      state:        parseContainerState(state ?? ''),
      status:       status ?? '',
      ports:        ports ?? '',
      restartCount,
      lastSeen:     new Date().toISOString(),
    });
  }
  return containers;
}

/** Restart a container */
export async function restartContainer(nameOrId: string, timeout = 10): Promise<{ ok: boolean; output: string }> {
  logger.info('Container restart requested', { container: nameOrId });
  const { stdout, stderr } = await run(dockerCmd(['restart', `-t${timeout}`, nameOrId]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

/** Start a stopped container */
export async function startContainer(nameOrId: string): Promise<{ ok: boolean; output: string }> {
  logger.info('Container start requested', { container: nameOrId });
  const { stdout, stderr } = await run(dockerCmd(['start', nameOrId]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

/** Stop a running container */
export async function stopContainer(nameOrId: string, timeout = 10): Promise<{ ok: boolean; output: string }> {
  logger.info('Container stop requested', { container: nameOrId });
  const { stdout, stderr } = await run(dockerCmd(['stop', `-t${timeout}`, nameOrId]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

/** Pull latest image for a container */
export async function pullImage(image: string): Promise<{ ok: boolean; output: string }> {
  logger.info('Container image pull requested', { image });
  const { stdout, stderr } = await run(dockerCmd(['pull', image]), 120_000);
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

/** Inspect a container — returns parsed JSON */
export async function inspectContainer(nameOrId: string): Promise<Record<string, unknown> | null> {
  const { stdout } = await run(dockerCmd(['inspect', nameOrId]));
  try {
    const arr = JSON.parse(stdout) as Array<Record<string, unknown>>;
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

/** Return container logs (last N lines) */
export async function containerLogs(nameOrId: string, tail = 50): Promise<string> {
  const { stdout } = await run(dockerCmd(['logs', `--tail=${tail}`, nameOrId]), 10_000);
  return stdout;
}

/** Stats snapshot */
export async function containerStats(nameOrId: string): Promise<string> {
  const { stdout } = await run(dockerCmd(['stats', '--no-stream', '--format', 'json', nameOrId]), 10_000);
  return stdout;
}

/** Prune stopped containers */
export async function pruneContainers(): Promise<string> {
  const { stdout } = await run(dockerCmd(['container', 'prune', '-f']));
  return stdout;
}

/** Check if Docker is available */
export async function dockerAvailable(): Promise<boolean> {
  try {
    const { stdout } = await run(dockerCmd(['info', '--format={{.ServerVersion}}']), 5_000);
    return !!stdout.trim();
  } catch {
    return false;
  }
}
