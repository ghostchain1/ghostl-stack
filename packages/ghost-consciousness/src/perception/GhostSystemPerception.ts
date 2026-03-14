import type { EcosystemState, NetworkHealth, EconomicStatus } from '../types.js';

/**
 * GhostSystemPerception — the sensory layer of the Consciousness.
 *
 * In production this would aggregate telemetry from:
 *  - Prometheus / Grafana (node metrics, gas, latency)
 *  - GhostChain RPC nodes (block height, validator count, finality)
 *  - DeFi oracle feeds (TVL, token price, volume)
 *  - Bridge monitors (liquidity, cross-chain tx queue depth)
 *  - Alert Manager (active alerts → threat level)
 *
 * The perception layer abstracts all these sources into a single
 * EcosystemState value that every other Consciousness module can
 * reason about without knowing the underlying data sources.
 *
 * The `observe()` method is async to support live I/O in production.
 * In development / simulation mode it returns a configurable synthetic state.
 */
export class GhostSystemPerception {
  private _overrideState: Partial<EcosystemState> | null = null;

  /**
   * Observe the current ecosystem and return a normalised EcosystemState.
   *
   * In a live deployment this would fan out to multiple data sources in
   * parallel and merge results. Here we return a synthetic healthy-state
   * baseline that can be overridden for simulation.
   */
  async observe(): Promise<EcosystemState> {
    const base = await this.collectMetrics();
    return {
      ...base,
      ...this._overrideState,
      timestamp: Date.now(),
    };
  }

  /**
   * Inject a partial override for simulation / testing.
   * Merged on top of the collected metrics during observe().
   */
  override(partial: Partial<EcosystemState>): void {
    this._overrideState = { ...(this._overrideState ?? {}), ...partial };
  }

  /** Clear all overrides (revert to live observation). */
  clearOverride(): void {
    this._overrideState = null;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Collect metrics from all registered adapters.
   * In production: each sub-method calls a real client; here returns baseline.
   */
  private async collectMetrics(): Promise<EcosystemState> {
    const [health, economy, nodes, capacity, treaties, swarms, threat] = await Promise.all([
      this.fetchNetworkHealth(),
      this.fetchEconomicStatus(),
      this.fetchNodeCount(),
      this.fetchFreeCapacity(),
      this.fetchActiveTreaties(),
      this.fetchSwarmCount(),
      this.fetchThreatLevel(),
    ]);

    return {
      networkHealth: health,
      economy,
      nodes,
      freeCapacity: capacity,
      activeTreaties: treaties,
      swarmCount: swarms,
      threatLevel: threat,
      timestamp: Date.now(),
    };
  }

  /** Derive network health from validator liveness / block time. */
  private async fetchNetworkHealth(): Promise<NetworkHealth> {
    return 'healthy'; // live: query RPC /net_health or Prometheus validator_up gauge
  }

  /** Derive economic status from TVL trend + oracle price deviation. */
  private async fetchEconomicStatus(): Promise<EconomicStatus> {
    return 'stable'; // live: compare 24h TVL delta and price band compliance
  }

  /** Query registered node count from chain API or service registry. */
  private async fetchNodeCount(): Promise<number> {
    return 25; // live: Prometheus ghostchain_validators_total
  }

  /** Estimate free capacity from resource utilisation across nodes. */
  private async fetchFreeCapacity(): Promise<number> {
    return 60; // live: (1 - avg_cpu_usage) * 100 from node-exporter
  }

  /** Count active treaties from the TreatyEngine registry. */
  private async fetchActiveTreaties(): Promise<number> {
    return 0; // live: GhostTreatyEngine.activeCount
  }

  /** Count running swarm agent processes. */
  private async fetchSwarmCount(): Promise<number> {
    return 3; // live: GhostSwarmCouncil.size
  }

  /** Map alert severity to threat level. */
  private async fetchThreatLevel(): Promise<EcosystemState['threatLevel']> {
    return 'none'; // live: AlertManager critical/warning alert count
  }
}
