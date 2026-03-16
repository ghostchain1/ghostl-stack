// GhostOS SDK — Hypervisor Management

import type { GhostOSConfig, ResourceSpec, GhostOSResult } from '../types.js';

export interface GhostVMSpec extends ResourceSpec {
  name: string;
  image?: string;       // base OS image
  network?: string;
  sshKey?: string;
  role?: 'validator' | 'sequencer' | 'bridge' | 'rpc' | 'general';
}

export interface GhostVMInfo {
  id: string;
  name: string;
  state: 'running' | 'stopped' | 'paused' | 'crashed';
  ip: string;
  cpu: number;
  memory: string;
  role?: string;
  createdAt: string;
}

/**
 * GhostHypervisor — VM lifecycle management.
 * Wraps the GAIS REST API (:9100) to create, start, stop, and snapshot VMs
 * on the GhostStack baremetal hypervisor (KVM/QEMU via libvirt).
 */
export class GhostHypervisor {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  /** Create and start a new VM */
  async createVM(spec: GhostVMSpec): Promise<GhostVMInfo> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] hypervisor.createVM name=${spec.name} cpu=${spec.cpu} mem=${spec.memory}`);
      return { id: `dry-${Date.now()}`, name: spec.name, state: 'running', ip: '0.0.0.0', cpu: spec.cpu, memory: spec.memory, createdAt: new Date().toISOString() };
    }
    return this._rpc<GhostVMInfo>('hypervisor.createVM', spec as unknown as Record<string, unknown>);
  }

  /** List all VMs */
  async listVMs(): Promise<GhostVMInfo[]> {
    return this._rpc<GhostVMInfo[]>('hypervisor.listVMs');
  }

  /** Get a single VM by name */
  async getVM(name: string): Promise<GhostVMInfo> {
    return this._rpc<GhostVMInfo>('hypervisor.getVM', { name });
  }

  /** Start a stopped VM */
  async startVM(name: string): Promise<GhostOSResult> {
    return this._execVM('hypervisor.startVM', name);
  }

  /** Stop a running VM gracefully */
  async stopVM(name: string): Promise<GhostOSResult> {
    return this._execVM('hypervisor.stopVM', name);
  }

  /** Hard reset a VM */
  async resetVM(name: string): Promise<GhostOSResult> {
    return this._execVM('hypervisor.resetVM', name);
  }

  /** Destroy (delete) a VM permanently */
  async destroyVM(name: string): Promise<GhostOSResult> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] hypervisor.destroyVM name=${name}`);
      return { success: true };
    }
    return this._execVM('hypervisor.destroyVM', name);
  }

  /** Snapshot VM state before a hard operation */
  async snapshotVM(name: string, label?: string): Promise<GhostOSResult<{ snapshotId: string }>> {
    return this._rpc('hypervisor.snapshotVM', { name, label: label ?? `snap-${Date.now()}` });
  }

  /** Migrate VM to another physical host */
  async migrateVM(name: string, targetHost: string): Promise<GhostOSResult> {
    return this._rpc('hypervisor.migrateVM', { name, targetHost });
  }

  private async _execVM(method: string, name: string): Promise<GhostOSResult> {
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

    if (!res.ok) throw new Error(`GhostHypervisor RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostHypervisor: ${json.error.message}`);
    return json.result as T;
  }
}
