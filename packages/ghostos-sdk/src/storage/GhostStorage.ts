// GhostOS SDK — Storage Management

import type { GhostOSConfig, GhostOSResult } from '../types.js';

export interface GhostVolumeSpec {
  name: string;
  size: string;       // e.g. "500GB"
  type?: 'ssd' | 'hdd' | 'nvme';
  encrypted?: boolean;
}

export interface GhostVolumeInfo {
  id: string;
  name: string;
  size: string;
  type: string;
  usedPercent: number;
  mountPath: string;
}

/**
 * GhostStorage — persistent volume and block device management.
 */
export class GhostStorage {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  async createVolume(spec: GhostVolumeSpec): Promise<GhostVolumeInfo> {
    return this._rpc<GhostVolumeInfo>('storage.createVolume', spec as unknown as Record<string, unknown>);
  }

  async listVolumes(): Promise<GhostVolumeInfo[]> {
    return this._rpc<GhostVolumeInfo[]>('storage.listVolumes');
  }

  async attachVolume(volumeName: string, container: string, mountPath: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('storage.attachVolume', { volumeName, container, mountPath });
  }

  async detachVolume(volumeName: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('storage.detachVolume', { volumeName });
  }

  async snapshotVolume(volumeName: string, label?: string): Promise<GhostOSResult<{ snapshotId: string }>> {
    return this._rpc('storage.snapshotVolume', { volumeName, label: label ?? `snap-${Date.now()}` });
  }

  async removeVolume(volumeName: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('storage.removeVolume', { volumeName });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostStorage RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostStorage: ${json.error.message}`);
    return json.result as T;
  }
}
