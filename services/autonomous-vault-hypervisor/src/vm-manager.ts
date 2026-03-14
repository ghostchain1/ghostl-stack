// vm-manager.ts — libvirt/virsh VM lifecycle management
// Executes virsh commands either locally (if libvirt socket is mounted)
// or over SSH to the hypervisor host.
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CFG } from './config.js';
import { logger } from './logger.js';
import type { VmInfo, VmState, GhostLayer } from './types.js';

const execAsync = promisify(exec);

/** Build the command prefix — SSH or direct virsh */
function virshCmd(args: string[]): string {
  const virsh = `virsh ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`;
  if (!CFG.sshEnabled || !CFG.hypervisorHost) return virsh;
  const key = CFG.hypervisorKey ? `-i '${CFG.hypervisorKey}'` : '';
  const port = `-p ${CFG.hypervisorPort}`;
  const user = CFG.hypervisorUser;
  const host = CFG.hypervisorHost;
  return `ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o BatchMode=yes ${key} ${port} ${user}@${host} '${args.map(a => a.replace(/'/g, "'\\''")).join(' ')}' 2>&1`;
}

async function run(cmd: string, timeout = 15_000): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(cmd, { timeout });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? String(err) };
  }
}

function parseVmState(stateStr: string): VmState {
  const s = stateStr.trim().toLowerCase();
  if (s === 'running') return 'running';
  if (s === 'shut off') return 'shut off';
  if (s === 'paused') return 'paused';
  if (s === 'crashed') return 'crashed';
  return 'unknown';
}

function layerForVm(name: string): GhostLayer {
  const mapped = CFG.vmLayerMap[name];
  if (mapped === 'L0') return 'L0';
  if (mapped === 'L1') return 'L1';
  if (mapped === 'L2') return 'L2';
  if (mapped === 'L3') return 'L3';
  // Infer from name pattern
  if (/l3|layer.?3/i.test(name)) return 'L3';
  if (/l2|layer.?2/i.test(name)) return 'L2';
  if (/l0|layer.?0/i.test(name)) return 'L0';
  return 'L1'; // default
}

/** Return all VMs managed by libvirt */
export async function discoverVms(): Promise<VmInfo[]> {
  const cmd = virshCmd(['list', '--all', '--name']);
  const { stdout, stderr } = await run(cmd);
  if (stderr && !stdout) {
    logger.warn('virsh list error', { stderr: stderr.slice(0, 200) });
    return [];
  }
  const names = stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const vms: VmInfo[] = [];
  for (const name of names) {
    const stateCmd = virshCmd(['domstate', name]);
    const { stdout: stateOut } = await run(stateCmd, 5_000);
    const state = parseVmState(stateOut.trim());
    vms.push({
      id: name,
      name,
      state,
      layer: layerForVm(name),
      managedBy: 'libvirt',
      lastSeen: new Date().toISOString(),
    });
  }
  return vms;
}

export async function startVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM start requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['start', name]));
  return { ok: !stderr.toLowerCase().includes('error') && !stderr.toLowerCase().includes('failed'), output: stdout + stderr };
}

export async function shutdownVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM shutdown requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['shutdown', name]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

export async function destroyVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.warn('VM destroy requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['destroy', name]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

export async function restartVm(name: string): Promise<{ ok: boolean; output: string }> {
  logger.info('VM restart requested', { vm: name });
  const { stdout, stderr } = await run(virshCmd(['reboot', name]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

export async function snapshotVm(name: string, snapName?: string): Promise<{ ok: boolean; output: string }> {
  const snap = snapName ?? `snap-${Date.now()}`;
  logger.info('VM snapshot requested', { vm: name, snap });
  const { stdout, stderr } = await run(virshCmd(['snapshot-create-as', name, snap]));
  return { ok: !stderr.toLowerCase().includes('error'), output: stdout + stderr };
}

export async function domainInfo(name: string): Promise<Record<string, string>> {
  const { stdout } = await run(virshCmd(['dominfo', name]));
  const info: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const [k, ...rest] = line.split(':');
    if (k) info[k.trim()] = rest.join(':').trim();
  }
  return info;
}

export async function listSnapshots(name: string): Promise<string[]> {
  const { stdout } = await run(virshCmd(['snapshot-list', '--name', name]));
  return stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
}
