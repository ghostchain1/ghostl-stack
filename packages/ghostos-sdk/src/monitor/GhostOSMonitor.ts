// GhostOS SDK — Infrastructure Monitor

import type { GhostOSConfig, HealthStatus } from '../types.js';

export interface GhostOSAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  resource: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface GhostOSMetricPoint {
  timestamp: number;
  value: number;
}

/**
 * GhostOSMonitor — continuous infrastructure monitoring.
 * Polls metrics, raises alerts, and provides time-series data feed.
 */
export class GhostOSMonitor {
  private readonly config: GhostOSConfig;
  private readonly endpoint: string;
  private _pollIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: GhostOSConfig = {}) {
    this.config = config;
    this.endpoint = config.controlEndpoint ?? 'http://localhost:9100';
  }

  /** Get overall infrastructure health */
  async health(): Promise<HealthStatus> {
    return this._rpc<HealthStatus>('monitor.health');
  }

  /** Get active alerts */
  async getAlerts(onlyUnresolved = true): Promise<GhostOSAlert[]> {
    return this._rpc<GhostOSAlert[]>('monitor.getAlerts', { onlyUnresolved });
  }

  /** Acknowledge / resolve an alert */
  async resolveAlert(alertId: string): Promise<void> {
    await this._rpc('monitor.resolveAlert', { alertId });
  }

  /** Get CPU usage time series */
  async cpuSeries(minutes = 60): Promise<GhostOSMetricPoint[]> {
    return this._rpc<GhostOSMetricPoint[]>('monitor.cpuSeries', { minutes });
  }

  /** Get memory usage time series */
  async memorySeries(minutes = 60): Promise<GhostOSMetricPoint[]> {
    return this._rpc<GhostOSMetricPoint[]>('monitor.memorySeries', { minutes });
  }

  /** Start polling at a given interval (ms) and call handler on each update */
  startPolling(intervalMs: number, handler: (health: HealthStatus, alerts: GhostOSAlert[]) => void): void {
    this.stopPolling();
    this._pollIntervalId = setInterval(async () => {
      try {
        const [h, a] = await Promise.all([this.health(), this.getAlerts()]);
        handler(h, a);
      } catch (err) {
        console.error('[GhostOSMonitor] polling error:', err);
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this._pollIntervalId !== null) {
      clearInterval(this._pollIntervalId);
      this._pollIntervalId = null;
    }
  }

  private async _rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(`${this.endpoint}/rpc`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostOSMonitor RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostOSMonitor: ${json.error.message}`);
    return json.result as T;
  }
}
