// vm-manager.ts — libvirt/virsh VM lifecycle management
// Executes virsh commands either locally (if libvirt socket is mounted)
// or over SSH to the hypervisor host.

import { exec }  from 'node:child_process';
import { promisify } from 'node:util';
import { CFG }   from './config.js';
import { logger } from './logger.js';
import type { Layer, VmInfo, VmState } from './types.js';

const execAsync = promisify(exec);

/** Build the command prefix — SSH or direct virsh */
function virshCmd(args: string[]): string {
  const virsh = `virsh ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;
  if (!CFG.sshEnabled || !CFG.hypervisorHost) return virsh;
  const key  = CFG.hypervisorKey ? `-i '${CFG.hypervisorKey}'` : '';
  const port = `-p ${CFG.hypervisorPort}`;
  const user = CFG.hypervisorUser;
  const host = CFG.hypervisorHost;
  return `ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o BatchMode=yes ${key} ${port} ${user}@${host} '${args.map(a => a.replace(/'/g, "'\\''")).join(' ')}' 2>&1`;
}

async function run(cmd: string, timeout = 15_000): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(cmd, { timeout });
    return result;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(err) };
  }
}

function parseVmState(stateStr: string): VmState {
  const s = stateStr.trim().toLowerCase();
  if (s === 'running')  return 'running';
  if (s === 'shut off') return 'shut off';
  if (s === 'paused')   return 'paused';
  if (s === 'crashed')  return 'crashed';
  return 'unknown';
}

function layerForVm(name: string): Layer {
  const mapped = CFG.vmLayerMap[name];
  if (mapped === 'L0') return 'L0';
  if (mapped === 'L1') return 'L1';
  if (mapped === 'L2') return 'L2';
  if (mapped === 'L3') return 'L3';
  // Infer from name
  if (/l3/i.test(name)) return 'L3';
  if (/l2/i.test(name)) return 'L2';
  return 'L1';
}

/** List all VMs (including shut off) */
export async function discoverVms(): Promise<VmInfo[]> {
  const cmd = virshCmd(['list', '--all']);
  const { stdout } = await run(cmd);
  const vms: VmInfo[] = [];

  for (const line of stdout.split('\n').slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [idStr, name, ...stateArr] = parts;
    if (!name || idStr === undefined) continue;
    const stateStr = stateArr.join(' ');
    vms.push({
      id:        idStr === '-' ? `offline-${name}` : idStr,
      name,
      state:     parseVmState(stateStr),
      layer:     layerForVm(name),
      managedBy: CFG.serviceName,
      lastSeen:  new Date().toISOString(),
    });
  }
  return vms;
}

/** Start a VM */
export async function startVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM start requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['start', name]));
  const ok = stdout.toLowerCase().includes('started') || !stderr;
  return { ok, output: stdout + stderr };
}

/** Graceful shutdown of a VM */
export async function shutdownVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM shutdown requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['shutdown', name]));
  const ok = stdout.toLowerCase().includes('shutdown') || !stderr;
  return { ok, output: stdout + stderr };
}

/** Force-stop a VM */
export async function destroyVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.warn('VM destroy (force-stop) requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['destroy', name]));
  return { ok: !stderr.includes('error'), output: stdout + stderr };
}

/** Restart a VM (graceful, then start) */
export async function restartVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM restart requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['reboot', name]));
  const ok = !stderr.toLowerCase().includes('error');
  return { ok, output: stdout + stderr };
}

/** Create a snapshot of a VM */
export async function snapshotVm(name: string, snapshotName?: string): Promise<{ ok: boolean; output: string }> {
  const snap = snapshotName ?? `auto-${Date.now()}`;
  logger.info('VM snapshot requested', { vm: name, snapshot: snap });
  const { stdout, stderr } = await run(virshCmd(['snapshot-create-as', name, snap]), 30_000);
  const ok = !stderr.toLowerCase().includes('error');
  return { ok, output: stdout + stderr };
}

/** Get QEMU guest info / domain info */
export async function domainInfo(name: string): Promise<Record<string, string>> {
  const { stdout } = await run(virshCmd(['dominfo', name]));
  const info: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
    const val = line.slice(idx + 1).trim();
    if (key && val) info[key] = val;
  }
  return info;
}

/** List VM snapshots */
export async function listSnapshots(name: string): Promise<string[]> {
  const { stdout } = await run(virshCmd(['snapshot-list', name]));
  const snaps: string[] = [];
  for (const line of stdout.split('\n').slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0]) snaps.push(parts[0]);
  }
  return snaps;
}
