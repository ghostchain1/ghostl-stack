// GhostCloud Infrastructure SDK
// Manages baremetal, Hetzner, AWS, and GCP deployments of GhostChain validator nodes.
// Communicates with GAIS (GhostChain AI Infrastructure Supervisor) at :9100.

export type GhostCloudProvider = 'baremetal' | 'hetzner' | 'aws' | 'gcp';
export type GhostNodeRole = 'validator' | 'sequencer' | 'full-node' | 'archive-node' | 'rpc-node';
export type GhostServerStatus = 'running' | 'stopped' | 'provisioning' | 'error' | 'terminated';
export type GhostChainLayer = 'l1' | 'l2' | 'l3';

export interface GhostCloudConfig {
  /** GAIS REST API — default http://localhost:9100 */
  gaisEndpoint: string;
  authToken: string;
  provider?: GhostCloudProvider;
}

export interface GhostServerSpec {
  id: string;
  provider: GhostCloudProvider;
  region: string;
  instanceType: string;
  cpuCores: number;
  ramGb: number;
  diskGb: number;
  ipv4: string;
  ipv6?: string;
  status: GhostServerStatus;
  role: GhostNodeRole;
  layer: GhostChainLayer;
  createdAt: number;
  tags: Record<string, string>;
}

export interface GhostDeployParams {
  provider: GhostCloudProvider;
  region: string;
  instanceType: string;
  role: GhostNodeRole;
  layer: GhostChainLayer;
  /** Cloud-init / ansible playbook to bootstrap node */
  bootstrapScript?: string;
  tags?: Record<string, string>;
  snapshotOnCreate?: boolean;
}

export interface GhostScaleParams {
  serverId: string;
  newInstanceType: string;
  /** Create snapshot before resize */
  snapshotFirst?: boolean;
}

export interface GhostNodeHealth {
  serverId: string;
  blockHeight: number;
  syncStatus: 'synced' | 'syncing' | 'behind';
  peerCount: number;
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
  uptimeSeconds: number;
  lastChecked: number;
}

/**
 * GhostCloud — unified cloud infrastructure manager for GhostChain nodes.
 *
 * @example
 * ```ts
 * import { GhostCloud } from '@ghostchain/ghostcloud-sdk';
 *
 * const cloud = new GhostCloud({
 *   gaisEndpoint: 'http://localhost:9100',
 *   authToken: process.env.GAIS_TOKEN!,
 * });
 *
 * // Deploy a validator on Hetzner
 * const server = await cloud.deploy({
 *   provider: 'hetzner',
 *   region: 'nbg1',
 *   instanceType: 'cx41',
 *   role: 'validator',
 *   layer: 'l1',
 * });
 *
 * // Monitor health
 * const health = await cloud.health(server.id);
 * ```
 */
export class GhostCloud {
  private readonly config: GhostCloudConfig;

  constructor(config: GhostCloudConfig) {
    this.config = config;
  }

  /** Deploy a new GhostChain node to the specified cloud provider */
  async deploy(params: GhostDeployParams): Promise<GhostServerSpec> {
    return this._api<GhostServerSpec>('POST', '/api/servers/deploy', params);
  }

  /** List all managed servers */
  async listServers(filters?: { provider?: GhostCloudProvider; layer?: GhostChainLayer; role?: GhostNodeRole }): Promise<GhostServerSpec[]> {
    const q = new URLSearchParams(filters as Record<string, string>).toString();
    return this._api<GhostServerSpec[]>('GET', `/api/servers${q ? `?${q}` : ''}`);
  }

  /** Get a specific server */
  async getServer(id: string): Promise<GhostServerSpec> {
    return this._api<GhostServerSpec>('GET', `/api/servers/${id}`);
  }

  /** Scale a server to a new instance type */
  async scale(params: GhostScaleParams): Promise<GhostServerSpec> {
    return this._api<GhostServerSpec>('POST', `/api/servers/${params.serverId}/scale`, params);
  }

  /** Terminate a server (irreversible — confirms before executing if CI env) */
  async terminate(id: string, opts = { force: false }): Promise<void> {
    await this._api('DELETE', `/api/servers/${id}`, opts);
  }

  /** Reboot a server */
  async reboot(id: string): Promise<void> {
    await this._api('POST', `/api/servers/${id}/reboot`);
  }

  /** Snapshot a server before maintenance */
  async snapshot(id: string, label?: string): Promise<{ snapshotId: string }> {
    return this._api('/api/servers/${id}/snapshot', 'POST', { label });
  }

  /** Get node health metrics */
  async health(serverId: string): Promise<GhostNodeHealth> {
    return this._api<GhostNodeHealth>('GET', `/api/servers/${serverId}/health`);
  }

  /** Get health for all servers */
  async healthAll(): Promise<GhostNodeHealth[]> {
    return this._api<GhostNodeHealth[]>('GET', '/api/health');
  }

  /** Update the GhostChain node binary on a server */
  async updateNodeBinary(serverId: string, version: string): Promise<{ txLog: string }> {
    return this._api('/api/servers/${serverId}/update', 'POST', { version });
  }

  /** Rotate keys on a validator node */
  async rotateValidatorKeys(serverId: string): Promise<{ newPublicKey: string }> {
    return this._api<{ newPublicKey: string }>('POST', `/api/servers/${serverId}/rotate-keys`);
  }

  // Provider-specific factory helpers
  static forHetzner(authToken: string, gaisEndpoint = 'http://localhost:9100'): GhostCloud {
    return new GhostCloud({ gaisEndpoint, authToken, provider: 'hetzner' });
  }
  static forAWS(authToken: string, gaisEndpoint = 'http://localhost:9100'): GhostCloud {
    return new GhostCloud({ gaisEndpoint, authToken, provider: 'aws' });
  }
  static forGCP(authToken: string, gaisEndpoint = 'http://localhost:9100'): GhostCloud {
    return new GhostCloud({ gaisEndpoint, authToken, provider: 'gcp' });
  }
  static forBaremetal(authToken: string, gaisEndpoint = 'http://localhost:9100'): GhostCloud {
    return new GhostCloud({ gaisEndpoint, authToken, provider: 'baremetal' });
  }

  private async _api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.gaisEndpoint}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.authToken}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`GhostCloud [${method} ${path}]: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }
}

export default GhostCloud;
