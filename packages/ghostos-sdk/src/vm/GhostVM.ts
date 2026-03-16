// GhostOS SDK — VM Runtime (guest-side agent interface)

import type { GhostOSConfig, GhostOSResult } from '../types.js';

export interface GhostVMRuntime {
  id: string;
  name: string;
  guestIP: string;
  role: string;
}

/**
 * GhostVM — guest-side runtime for VMs running inside the GhostHypervisor.
 * Provides self-reporting and lifecycle hooks for validator/sequencer VMs.
 */
export class GhostVM {
  private readonly config: GhostOSConfig;
  private readonly agentEndpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.agentEndpoint = config.controlEndpoint ?? 'http://localhost:9101';
  }

  /** Register this VM with the GhostBrain control plane */
  async register(vmId: string, role: string): Promise<GhostOSResult> {
    return this._rpc('vm.register', { vmId, role });
  }

  /** Report heartbeat to the control plane */
  async heartbeat(vmId: string): Promise<GhostOSResult> {
    return this._rpc('vm.heartbeat', { vmId, timestamp: Date.now() });
  }

  /** Announce readiness (e.g. after a validator starts syncing) */
  async ready(vmId: string): Promise<GhostOSResult> {
    return this._rpc('vm.ready', { vmId });
  }

  /** Request controlled shutdown from inside the VM */
  async requestShutdown(vmId: string, reason: string): Promise<GhostOSResult> {
    return this._rpc('vm.requestShutdown', { vmId, reason });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.agentEndpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostVM agent error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostVM: ${json.error.message}`);
    return json.result as T;
  }
}
