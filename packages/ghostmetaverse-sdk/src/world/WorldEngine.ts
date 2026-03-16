/**
 * WorldEngine — GhostMetaverse World Creation and Management
 *
 * A GhostMetaverse world is a named 3D scene anchored to a land parcel (GRC-721 token).
 * Worlds live on GhostChain L3 (chain_id 903).  All cross-chain writes must flow
 * L3 → L2 → L1 — this engine never calls L1 directly.
 */

const L3_RPC = 'http://localhost:39545';

export interface GhostWorldConfig {
  name:         string;
  description?: string;
  maxPlayers:   number;
  gravity:      number;     // m/s² (default 9.81)
  skybox?:      string;     // ghost:// URI to skybox asset
  spawnPoint:   { x: number; y: number; z: number };
  scriptUri?:   string;     // ghost:// URI to on-chain world script
  public:       boolean;
}

export interface GhostWorld {
  worldId:     string;
  name:        string;
  parcelId:    bigint;
  owner:       string;
  config:      GhostWorldConfig;
  blockNumber: bigint;
  createdAt:   number;
  updatedAt:   number;
  playerCount: number;
  active:      boolean;
}

export interface WorldFilter {
  owner?:   string;
  public?:  boolean;
  active?:  boolean;
  parcelId?: bigint;
}

const SCENE_REGISTRY = '0x0000000000000000000000000000000000010004';

// ─── WorldEngine ──────────────────────────────────────────────────────────────

export class WorldEngine {
  private rpc: string;
  private cache: Map<string, GhostWorld> = new Map();

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Create a new world anchored to a land parcel.
   *
   * @param name        Human-readable world name
   * @param parcelId    GRC-721 token ID of the owning land parcel
   * @param config      World configuration
   * @param signedTx    Signed transaction (from GhostWallet)
   * @returns           Newly created world object
   */
  async createWorld(name: string, parcelId: bigint, config: GhostWorldConfig, signedTx: string): Promise<GhostWorld> {
    const txHash = await this.ethCall<string>('ghost_sendRawTransaction', [signedTx]);
    const receipt = await this.waitForReceipt(txHash);

    const worldId = this.deriveWorldId(name, parcelId, receipt.blockNumber);

    const world: GhostWorld = {
      worldId,
      name,
      parcelId,
      owner:       receipt.from,
      config,
      blockNumber: BigInt(receipt.blockNumber),
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      playerCount: 0,
      active:      true,
    };

    this.cache.set(worldId, world);
    return world;
  }

  /**
   * Get a world by its ID (cache-first, then on-chain).
   */
  async getWorld(worldId: string): Promise<GhostWorld> {
    if (this.cache.has(worldId)) return this.cache.get(worldId)!;

    const data = await this.ethCallStatic<GhostWorld>('ghost_call', {
      to:   SCENE_REGISTRY,
      data: this.encodeParam('getWorld(bytes32)', this.idToBytes32(worldId)),
    });

    this.cache.set(worldId, data);
    return data;
  }

  /**
   * List worlds matching optional filter criteria.
   */
  async listWorlds(filter: WorldFilter = {}): Promise<GhostWorld[]> {
    const worlds = Array.from(this.cache.values());
    return worlds.filter(w => {
      if (filter.owner   !== undefined && w.owner         !== filter.owner)            return false;
      if (filter.public  !== undefined && w.config.public !== filter.public)           return false;
      if (filter.active  !== undefined && w.active        !== filter.active)           return false;
      if (filter.parcelId !== undefined && w.parcelId     !== filter.parcelId)         return false;
      return true;
    });
  }

  /**
   * Update world configuration.
   * Requires an authorised signed transaction from the world owner.
   */
  async updateWorld(worldId: string, config: Partial<GhostWorldConfig>, signedTx: string): Promise<string> {
    const txHash = await this.ethCall<string>('ghost_sendRawTransaction', [signedTx]);

    const cached = this.cache.get(worldId);
    if (cached) {
      cached.config    = { ...cached.config, ...config };
      cached.updatedAt = Date.now();
    }

    return txHash;
  }

  /**
   * Deactivate a world (governance/owner only).
   */
  async destroyWorld(worldId: string, signedTx: string): Promise<string> {
    const txHash = await this.ethCall<string>('ghost_sendRawTransaction', [signedTx]);

    const cached = this.cache.get(worldId);
    if (cached) {
      cached.active    = false;
      cached.updatedAt = Date.now();
    }

    return txHash;
  }

  /**
   * Advance the world by one block tick (returns current L3 block number).
   */
  async tick(): Promise<bigint> {
    const hex = await this.ethCall<string>('ghost_blockNumber', []);
    return BigInt(hex);
  }

  /**
   * Increment the online player count in local cache.
   */
  trackPlayerJoin(worldId: string): void {
    const w = this.cache.get(worldId);
    if (w) w.playerCount++;
  }

  /**
   * Decrement the online player count in local cache.
   */
  trackPlayerLeave(worldId: string): void {
    const w = this.cache.get(worldId);
    if (w && w.playerCount > 0) w.playerCount--;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async ethCall<T>(method: string, params: unknown[]): Promise<T> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`WorldEngine: ${json.error.message}`);
    return json.result as T;
  }

  private async ethCallStatic<T>(method: string, callObj: unknown): Promise<T> {
    return this.ethCall<T>(method, [callObj, 'latest']);
  }

  private async waitForReceipt(txHash: string): Promise<{ blockNumber: string; from: string }> {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const receipt = await this.ethCall<{ blockNumber: string; from: string } | null>(
        'ghost_getTransactionReceipt', [txHash]);
      if (receipt) return receipt;
    }
    throw new Error(`WorldEngine: timeout waiting for receipt ${txHash}`);
  }

  private deriveWorldId(name: string, parcelId: bigint, blockNumber: string): string {
    // Deterministic world ID derived from name + parcel + block
    const raw  = `${name}:${parcelId}:${blockNumber}`;
    let   hash = 0x811c9dc5;
    for (const ch of new TextEncoder().encode(raw)) {
      hash ^= ch;
      hash = (hash * 0x01000193) >>> 0;
    }
    return `0x${hash.toString(16).padStart(8, '0')}`;
  }

  private idToBytes32(id: string): string {
    return id.padEnd(66, '0');
  }

  private encodeParam(_sig: string, param: string): string {
    return param;
  }

  static devnet(): WorldEngine {
    return new WorldEngine('http://localhost:39545');
  }
}
