/**
 * WorldEngine — Ghost Universe World Orchestrator (GhostChain L3)
 *
 * Controls creation, lifecycle, and runtime of all worlds in the Ghost Universe.
 * Worlds are anchored to GhostChain L3 (chainId 903) for scene data and
 * to GhostChain L2 (chainId 901) for asset ownership.
 *
 * Economic flow: L3 → L2 liquidity → GhostChain L1 treasury
 *
 * Supported worlds:
 *   Ghost City | Ghost Arena | Ghost Casino | Ghost Mall | Ghost Festival
 */

import { WorldGenerator }    from './generator/WorldGenerator.js';
import { PhysicsEngine }     from './physics/PhysicsEngine.js';
import { EnvironmentSystem } from './environment/EnvironmentSystem.js';
import { WorldMap }          from './map/WorldMap.js';
import type { Region }       from './generator/WorldGenerator.js';

export type WorldTheme = 'ghost-city' | 'ghost-arena' | 'ghost-casino' | 'ghost-mall' | 'ghost-festival' | 'custom';

export interface GhostWorld {
  id:          string;
  name:        string;
  theme:       WorldTheme;
  regions:     Region[];
  createdAt:   number;
  active:      boolean;
  playerCount: number;
  maxPlayers:  number;
  blockNumber: bigint;
}

export interface CreateWorldOptions {
  name:         string;
  theme?:       WorldTheme;
  seed?:        number;
  maxPlayers?:  number;
}

const L3_RPC = 'http://localhost:39545';

// ─── WorldEngine ─────────────────────────────────────────────────────────────

export class WorldEngine {
  private worlds:      Map<string, GhostWorld>          = new Map();
  private physics:     Map<string, PhysicsEngine>       = new Map();
  private environments:Map<string, EnvironmentSystem>  = new Map();
  private maps:        Map<string, WorldMap>            = new Map();
  private rpc:         string;

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Create a new world anchored to GhostChain L3.
   *
   * @example
   * const world = await engine.createWorld({ name: "Ghost City", theme: "ghost-city" })
   * // { id: "...", name: "Ghost City", regions: [...] }
   */
  async createWorld(options: CreateWorldOptions): Promise<GhostWorld> {
    const id      = `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const seed    = options.seed ?? (Date.now() & 0xffffffff);
    const theme   = options.theme ?? 'custom';

    const generator = new WorldGenerator({ seed, width: 400, height: 400, regionCount: 8, seaLevel: 0 });
    const regions   = generator.generateRegions();
    const blockNum  = await this.fetchBlockNumber();

    const world: GhostWorld = {
      id,
      name:        options.name,
      theme,
      regions,
      createdAt:   Date.now(),
      active:      true,
      playerCount: 0,
      maxPlayers:  options.maxPlayers ?? 5000,
      blockNumber: blockNum,
    };

    // Spin up physics + environment for this world
    const physics = new PhysicsEngine({
      gravity:    9.81,
      tickRateHz: 20,
      worldBounds: { minX: 0, minY: 0, minZ: 0, maxX: 400, maxY: 200, maxZ: 400 },
    });
    physics.start();

    const env = new EnvironmentSystem(id, { timeScale: 60, startTime: 28800, startSeason: 'spring', weatherVolatility: 0.05 });
    env.start();

    const map = new WorldMap(id);
    map.initFromRegions(regions);

    this.worlds.set(id, world);
    this.physics.set(id, physics);
    this.environments.set(id, env);
    this.maps.set(id, map);

    return world;
  }

  /**
   * Get a world by ID.
   */
  getWorld(id: string): GhostWorld | null {
    return this.worlds.get(id) ?? null;
  }

  /**
   * List all active worlds.
   */
  listWorlds(activeOnly = true): GhostWorld[] {
    return Array.from(this.worlds.values()).filter(w => !activeOnly || w.active);
  }

  /**
   * Get the WorldMap for spatial queries.
   */
  getMap(worldId: string): WorldMap | null {
    return this.maps.get(worldId) ?? null;
  }

  /**
   * Get environment snapshot (sky, weather, time-of-day).
   */
  getEnvironment(worldId: string) {
    return this.environments.get(worldId)?.snapshot() ?? null;
  }

  /**
   * Get the physics engine for direct body manipulation.
   */
  getPhysics(worldId: string): PhysicsEngine | null {
    return this.physics.get(worldId) ?? null;
  }

  /**
   * Track a player joining/leaving (updates playerCount).
   */
  trackJoin(worldId: string): void  { const w = this.worlds.get(worldId); if (w) w.playerCount++; }
  trackLeave(worldId: string): void { const w = this.worlds.get(worldId); if (w && w.playerCount > 0) w.playerCount--; }

  /**
   * Destroy a world and stop all simulation engines.
   */
  destroyWorld(id: string): void {
    this.physics.get(id)?.stop();
    this.environments.get(id)?.stop();
    this.physics.delete(id);
    this.environments.delete(id);
    this.maps.delete(id);
    const w = this.worlds.get(id);
    if (w) w.active = false;
  }

  /**
   * Tick — returns current L3 block number (utility for callers).
   */
  async tick(): Promise<bigint> {
    return this.fetchBlockNumber();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchBlockNumber(): Promise<bigint> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ghost_blockNumber', params: [] }),
    });
    const json = await res.json() as { result?: string };
    return BigInt(json.result ?? '0x0');
  }

  static devnet(): WorldEngine { return new WorldEngine('http://localhost:39545'); }
}
