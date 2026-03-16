import { readFile } from 'node:fs/promises';

export const GAIS_URL = process.env.GAIS_URL ?? 'http://127.0.0.1:9100';

const GAIS_ENV_FILE =
  process.env.GAIS_ENV_FILE ?? '/home/ghost/.config/ghoststack/gais.env';

type GaisStatus = {
  dry_run?: boolean;
  running_count?: number;
};

type GaisVmRecord = {
  name?: string;
  role?: string;
  ip?: string;
  state?: string;
  rpc_healthy?: boolean;
  heal_level?: string;
  escalated?: boolean;
  restarts_1h?: number;
};

type GaisVmPayload = {
  vms?: GaisVmRecord[];
};

export type PortalVmState =
  | 'running'
  | 'stopped'
  | 'suspended'
  | 'rebooting'
  | 'unknown';

export type PortalVm = {
  id: string;
  name: string;
  role: string;
  ip: string;
  state: PortalVmState;
  stateLabel: string;
  rpcHealthy: boolean;
  healLevel: string;
  escalated: boolean;
  restarts1h: number;
};

export type PortalVmListResponse = {
  vms: PortalVm[];
  total: number;
  running: number;
  dryRun: boolean;
  source: string;
  timestamp: string;
};

function normalizeVmState(rawState: string): {
  state: PortalVmState;
  stateLabel: string;
} {
  const label = rawState.trim() || 'unknown';
  const value = label.toLowerCase();

  if (value.includes('running')) {
    return { state: 'running', stateLabel: label };
  }
  if (value.includes('pause') || value.includes('suspend')) {
    return { state: 'suspended', stateLabel: label };
  }
  if (value.includes('reboot') || value.includes('restart')) {
    return { state: 'rebooting', stateLabel: label };
  }
  if (
    value.includes('shut off') ||
    value.includes('stopped') ||
    value.includes('stop')
  ) {
    return { state: 'stopped', stateLabel: label };
  }

  return {
    state: 'unknown',
    stateLabel: value.includes('dry-run') ? 'dry-run' : label,
  };
}

function normalizeVm(record: GaisVmRecord): PortalVm {
  const name = record.name?.trim() || 'unknown-vm';
  const { state, stateLabel } = normalizeVmState(record.state ?? 'unknown');

  return {
    id: name,
    name,
    role: record.role?.trim() || 'general',
    ip: record.ip?.trim() || '',
    state,
    stateLabel,
    rpcHealthy: Boolean(record.rpc_healthy),
    healLevel: record.heal_level?.trim() || 'healthy',
    escalated: Boolean(record.escalated),
    restarts1h: Number(record.restarts_1h ?? 0),
  };
}

async function fetchGaisJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GAIS_URL}${path}`, {
    cache: 'no-store',
    ...init,
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`GAIS returned HTTP ${res.status} for ${path}`);
  }

  return res.json() as Promise<T>;
}

export async function loadPortalVms(): Promise<PortalVmListResponse> {
  const [vmsResult, statusResult] = await Promise.allSettled([
    fetchGaisJson<GaisVmPayload>('/vms'),
    fetchGaisJson<GaisStatus>('/status'),
  ]);

  if (vmsResult.status !== 'fulfilled') {
    throw vmsResult.reason;
  }

  const status = statusResult.status === 'fulfilled' ? statusResult.value : {};
  const records = Array.isArray(vmsResult.value.vms) ? vmsResult.value.vms : [];
  const vms = records.map(normalizeVm);

  return {
    vms,
    total: vms.length,
    running:
      typeof status.running_count === 'number'
        ? status.running_count
        : vms.filter((vm) => vm.state === 'running').length,
    dryRun: Boolean(status.dry_run),
    source: GAIS_URL,
    timestamp: new Date().toISOString(),
  };
}

async function readTokenFromEnvFile(): Promise<string> {
  try {
    const envText = await readFile(GAIS_ENV_FILE, 'utf8');
    const line = envText
      .split('\n')
      .find((entry) => entry.startsWith('GAIS_API_TOKEN='));
    return line ? line.slice('GAIS_API_TOKEN='.length).trim() : '';
  } catch {
    return '';
  }
}

export async function readGaisToken(): Promise<string> {
  const envToken = process.env.GAIS_API_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  return readTokenFromEnvFile();
}

