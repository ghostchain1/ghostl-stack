// GhostNode SDK — Peer Discovery

import type { GhostNodeConfig } from '../types.js';

export interface GhostPeerInfo {
  id: string;
  enode: string;
  name: string;
  caps: string[];
  network: { remoteAddress: string; inbound: boolean };
  protocols: Record<string, unknown>;
}

/**
 * GhostPeer — peer network management for GhostChain nodes.
 */
export class GhostPeer {
  private readonly config: GhostNodeConfig;

  constructor(config: GhostNodeConfig) {
    this.config = config;
  }

  /** List connected peers */
  async list(): Promise<GhostPeerInfo[]> {
    return this._rpc<GhostPeerInfo[]>('admin_peers');
  }

  /** Get peer count */
  async count(): Promise<number> {
    const hex = await this._rpc<string>('ghost_peerCount');
    return parseInt(hex, 16);
  }

  /** Add a peer by enode URL */
  async addPeer(enode: string): Promise<boolean> {
    return this._rpc<boolean>('admin_addPeer', [enode]);
  }

  /** Remove a peer by enode URL */
  async removePeer(enode: string): Promise<boolean> {
    return this._rpc<boolean>('admin_removePeer', [enode]);
  }

  /** Get node info (enode, listenAddr, etc.) */
  async selfInfo(): Promise<{ enode: string; name: string; id: string; listenAddr: string }> {
    return this._rpc('admin_nodeInfo');
  }

  private async _rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostPeer RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostPeer: ${json.error.message}`);
    return json.result as T;
  }
}
