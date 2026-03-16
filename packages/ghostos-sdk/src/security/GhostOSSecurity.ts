// GhostOS SDK — OS-level Security

import type { GhostOSConfig, GhostOSResult } from '../types.js';

export interface GhostOSSecurityEvent {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  sourceIP?: string;
  timestamp: string;
}

/**
 * GhostOSSecurity — OS firewall, audit log, and intrusion detection.
 */
export class GhostOSSecurity {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  /** Block an IP address on the host firewall */
  async blockIP(ip: string, reason: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('security.blockIP', { ip, reason });
  }

  /** Allow a previously blocked IP */
  async allowIP(ip: string): Promise<GhostOSResult> {
    return this._rpc<GhostOSResult>('security.allowIP', { ip });
  }

  /** Get recent security events */
  async getEvents(limit = 50): Promise<GhostOSSecurityEvent[]> {
    return this._rpc<GhostOSSecurityEvent[]>('security.getEvents', { limit });
  }

  /** Run a vulnerability scan on the host */
  async scan(): Promise<{ vulnerabilities: number; critical: number; summary: string }> {
    return this._rpc('security.scan');
  }

  /** Rotate SSH keys for a user */
  async rotateSSHKey(user: string): Promise<GhostOSResult<{ publicKey: string }>> {
    return this._rpc('security.rotateSSHKey', { user });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostOSSecurity RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostOSSecurity: ${json.error.message}`);
    return json.result as T;
  }
}
