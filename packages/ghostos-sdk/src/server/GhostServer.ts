// GhostOS SDK — Server Management

import type { GhostOSConfig, HealthStatus, GhostOSResult } from '../types.js';

export interface GhostServerInfo {
  hostname: string;
  ip: string;
  os: string;
  kernel: string;
  arch: string;
  cpuCores: number;
  totalMemory: string;
  totalDisk: string;
}

export interface GhostServerMetrics {
  cpuPercent: number;
  memoryUsed: string;
  memoryTotal: string;
  diskUsed: string;
  diskTotal: string;
  networkIn: number;   // bytes/s
  networkOut: number;  // bytes/s
  loadAvg: [number, number, number];
}

/**
 * GhostServer — baremetal server management for GhostChain infrastructure.
 * Manages server provisioning, metrics, and lifecycle from the GhostOS layer.
 */
export class GhostServer {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  /** Retrieve static server information */
  async info(): Promise<GhostServerInfo> {
    return this._rpc<GhostServerInfo>('server.info');
  }

  /** Get live performance metrics */
  async metrics(): Promise<GhostServerMetrics> {
    return this._rpc<GhostServerMetrics>('server.metrics');
  }

  /** Health check — fast liveness probe */
  async health(): Promise<HealthStatus> {
    return this._rpc<HealthStatus>('server.health');
  }

  /** Graceful reboot with optional delay (seconds) */
  async reboot(delaySecs = 0): Promise<GhostOSResult> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] server.reboot delay=${delaySecs}`);
      return { success: true };
    }
    return this._rpc<GhostOSResult>('server.reboot', { delay: delaySecs });
  }

  /** Hard power off */
  async shutdown(): Promise<GhostOSResult> {
    if (this.config.dryRun) {
      console.log('[GhostOS:DRY_RUN] server.shutdown');
      return { success: true };
    }
    return this._rpc<GhostOSResult>('server.shutdown');
  }

  /** Execute a whitelisted OS command via GAIS control API */
  async exec(command: string, args: string[] = []): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (this.config.dryRun) {
      console.log(`[GhostOS:DRY_RUN] server.exec ${command} ${args.join(' ')}`);
      return { stdout: '', stderr: '', exitCode: 0 };
    }
    return this._rpc('server.exec', { command, args });
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostOS RPC error: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostOS: ${json.error.message}`);
    return json.result as T;
  }
}
