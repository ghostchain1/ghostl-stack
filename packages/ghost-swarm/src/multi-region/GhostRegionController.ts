import type { Region } from '../types.js';
import { GhostRegionBalancer } from './GhostRegionBalancer.js';

/**
 * GhostRegionController — maintains the registry of geographic / logical regions
 * and coordinates cross-region orchestration.
 *
 * Nodes and services register their region here. The balancer queries the
 * controller to select targets for workload placement.
 */
export class GhostRegionController {
  private readonly regions = new Map<string, Region>();
  readonly balancer: GhostRegionBalancer;

  constructor() {
    this.balancer = new GhostRegionBalancer(this);
  }

  register(region: Region): void {
    this.regions.set(region.id, region);
  }

  unregister(regionId: string): void {
    this.regions.delete(regionId);
  }

  updateLatency(regionId: string, latencyMs: number): void {
    const r = this.regions.get(regionId);
    if (r) r.latencyMs = latencyMs;
  }

  updateHealth(regionId: string, healthy: boolean): void {
    const r = this.regions.get(regionId);
    if (r) r.healthy = healthy;
  }

  updateLoad(regionId: string, load: number): void {
    const r = this.regions.get(regionId);
    if (r) r.load = load;
  }

  getRegion(regionId: string): Region | undefined {
    return this.regions.get(regionId);
  }

  healthyRegions(): Region[] {
    return [...this.regions.values()].filter(r => r.healthy);
  }

  allRegions(): Region[] {
    return [...this.regions.values()];
  }

  regionCount(): number {
    return this.regions.size;
  }
}
