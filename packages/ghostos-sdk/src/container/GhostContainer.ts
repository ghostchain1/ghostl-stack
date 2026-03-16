// GhostOS SDK — Container Management

import type { GhostOSConfig, GhostOSResult } from '../types.js';

export interface GhostContainerSpec {
  name: string;
  image: string;
  command?: string[];
  env?: Record<string, string>;
  ports?: Array<{ host: number; container: number; protocol?: 'tcp' | 'udp' }>;
  volumes?: Array<{ host: string; container: string; readOnly?: boolean }>;
  network?: string;
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
  labels?: Record<string, string>;
  memory?: string;
  cpus?: number;
}

export interface GhostContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'created';
  ip: string;
  ports: Array<{ host: number; container: number }>;
  createdAt: string;
}

/**
 * GhostContainer — Docker/OCI container lifecycle management.
 * Used by GhostBrain to deploy and manage GhostChain service containers.
 */
export class GhostContainer {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  /** Run a new container */
  async run(spec: GhostContainerSpec): Promise<GhostContainerInfo> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] container.run image=${spec.image} name=${spec.name}`);
      return { id: `dry-${Date.now()}`, name: spec.name, image: spec.image, state: 'running', ip: '0.0.0.0', ports: [], createdAt: new Date().toISOString() };
    }
    return this._rpc<GhostContainerInfo>('container.run', spec as unknown as Record<string, unknown>);
  }

  /** List running containers (optionally filtered by label) */
  async list(label?: string): Promise<GhostContainerInfo[]> {
    return this._rpc<GhostContainerInfo[]>('container.list', label ? { label } : {});
  }

  /** Inspect a single container */
  async inspect(name: string): Promise<GhostContainerInfo> {
    return this._rpc<GhostContainerInfo>('container.inspect', { name });
  }

  /** Start a stopped container */
  async start(name: string): Promise<GhostOSResult> {
    return this._exec('container.start', name);
  }

  /** Stop a running container gracefully */
  async stop(name: string, timeout = 30): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('container.stop', { name, timeout });
  }

  /** Remove a container */
  async remove(name: string, force = false): Promise<GhostOSResult> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] container.remove name=${name}`);
      return { success: true };
    }
    return this._rpc<GhostOSResult>('container.remove', { name, force });
  }

  /** Restart a container */
  async restart(name: string): Promise<GhostOSResult> {
    return this._exec('container.restart', name);
  }

  /** Stream container logs (last N lines) */
  async logs(name: string, tail = 100): Promise<string> {
    const result = await this._rpc<{ logs: string }>('container.logs', { name, tail });
    return result.logs;
  }

  /** Ensure a container is running — starts it if not */
  async ensure(spec: GhostContainerSpec): Promise<GhostOSResult<GhostContainerInfo>> {
    let info: GhostContainerInfo | null = null;
    try {
      info = await this.inspect(spec.name);
    } catch (_) {
      // container doesn't exist yet
    }

    if (!info) {
      const created = await this.run(spec);
      return { success: true, data: created };
    }
    if (info.state !== 'running') {
      await this.start(spec.name);
      info = await this.inspect(spec.name);
    }

    return { success: true, data: info };
  }

  private async _exec(method: string, name: string): Promise<GhostOSResult> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] ${method} name=${name}`);
      return { success: true };
    }
    return this._rpc<GhostOSResult>(method, { name });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostContainer RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostContainer: ${json.error.message}`);
    return json.result as T;
  }
}
