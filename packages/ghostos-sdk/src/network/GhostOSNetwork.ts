// GhostOS SDK — Network Management

import type { GhostOSConfig, GhostOSResult } from '../types.js';

export interface GhostNetworkSpec {
  name: string;
  subnet: string;      // CIDR, e.g. "10.42.0.0/16"
  gateway?: string;
  driver?: 'bridge' | 'overlay' | 'host';
  labels?: Record<string, string>;
}

export interface GhostNetworkInfo {
  id: string;
  name: string;
  subnet: string;
  gateway: string;
  driver: string;
  containers: string[];
}

/**
 * GhostOSNetwork — virtual network management for GhostChain nodes.
 */
export class GhostOSNetwork {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  async create(spec: GhostNetworkSpec): Promise<GhostNetworkInfo> {
    return this._rpc<GhostNetworkInfo>('network.create', spec as unknown as Record<string, unknown>);
  }

  async list(): Promise<GhostNetworkInfo[]> {
    return this._rpc<GhostNetworkInfo[]>('network.list');
  }

  async inspect(name: string): Promise<GhostNetworkInfo> {
    return this._rpc<GhostNetworkInfo>('network.inspect', { name });
  }

  async connect(network: string, container: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('network.connect', { network, container });
  }

  async disconnect(network: string, container: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('network.disconnect', { network, container });
  }

  async remove(name: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('network.remove', { name });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostOSNetwork RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostOSNetwork: ${json.error.message}`);
    return json.result as T;
  }
}
