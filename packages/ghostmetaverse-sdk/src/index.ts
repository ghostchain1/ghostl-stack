/**
 * GhostMetaverse SDK
 *
 * On-chain 3D virtual world layer for GhostChain.
 * Avatars, land parcels, scenes, portals, and social economy
 * all settle on GhostL3 (chain_id=903) and are anchored to
 * GhostL2 → GhostChain L1 for permanence.
 *
 * Token: GST (native)
 * NFT standard: GRC-721 (land parcels, avatars) + GRC-1155 (wearables, items)
 * RPC: ghost_* only
 */

// ─── Chain Targets ────────────────────────────────────────────────────────────

export const GHOST_METAVERSE_CHAINS = {
  /** World execution — L3 for high-throughput scene updates */
  world:    { chainId: 903,      rpc: 'http://localhost:39545', name: 'GhostL3' },
  /** Asset settlement — L2 for GRC-721/-1155 token ownership */
  assets:   { chainId: 901,      rpc: 'http://localhost:29545', name: 'GhostL2' },
  /** Governance / land registry permanence — L1 */
  registry: { chainId: 14000101, rpc: 'http://localhost:18545', name: 'GhostChain L1' },
} as const;

export const GST_UNIT = 10n ** 18n;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaverseLayer = 'world' | 'assets' | 'registry';

/** Coordinate in the Ghost Metaverse world grid */
export interface GhostCoord {
  x: number;
  y: number;
  z: number;
}

/** A land parcel (GRC-721 on GhostL2) */
export interface GhostParcel {
  tokenId:     bigint;
  owner:       string;
  x:           number;
  y:           number;
  width:       number;
  height:      number;
  name:        string;
  description: string;
  sceneUri:    string;   // IPFS / GhostCDN URI for 3D scene data
  priceGST:    bigint;   // 0 = not for sale
  forSale:     boolean;
  createdAt:   number;
}

/** An avatar (GRC-721 on GhostL2) */
export interface GhostAvatar {
  tokenId:      bigint;
  owner:        string;
  name:         string;
  modelUri:     string;  // IPFS / GhostCDN glTF model
  wearables:    bigint[];  // GRC-1155 token IDs equipped
  xp:           bigint;
  level:        number;
  gstBalance:   bigint;
  lastPosition: GhostCoord;
  createdAt:    number;
}

/** A wearable item (GRC-1155 on GhostL2) */
export interface GhostWearable {
  tokenId:  bigint;
  name:     string;
  rarity:   'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  slot:     'head' | 'body' | 'feet' | 'accessory' | 'weapon' | 'background';
  modelUri: string;
  supply:   bigint;
  priceGST: bigint;
}

/** A scene — JSON-based 3D world description tied to a parcel */
export interface GhostScene {
  parcelId:    bigint;
  version:     number;
  contentHash: string;  // sha256 of the scene payload
  contentUri:  string;  // GhostCDN or IPFS
  updatedAt:   number;
  updatedBy:   string;
}

/** An in-world portal linking two parcels or external GhostChain apps */
export interface GhostPortal {
  id:       string;
  fromX:    number;
  fromY:    number;
  toParcel: bigint | null;  // null = external app link
  toUri:    string;          // ghost://app/... or ghost://parcel/...
  label:    string;
}

/** Social event (concert, gallery opening, DAO vote, etc.) */
export interface GhostEvent {
  id:          string;
  title:       string;
  parcelId:    bigint;
  host:        string;
  startTime:   number;
  endTime:     number;
  maxAttendees: number;
  ticketGST:   bigint;  // 0 = free
  attendees:   string[];
}

/** Config for GhostMetaverse instance */
export interface GhostMetaverseConfig {
  /** L3 RPC for world state */
  worldRpc:     string;
  /** L2 RPC for asset ownership */
  assetsRpc:    string;
  /** L1 RPC for land registry */
  registryRpc?: string;
  /** On-chain land registry contract (GhostL2) */
  landRegistryAddress:   string;
  /** On-chain avatar registry contract (GhostL2) */
  avatarRegistryAddress: string;
  /** On-chain wearable contract (GhostL2 GRC-1155) */
  wearableAddress:       string;
  /** Scene storage contract (GhostL3) */
  sceneRegistryAddress:  string;
  /** Optional JWT for authenticated operations */
  authToken?: string;
}

// ─── RPC Helper ───────────────────────────────────────────────────────────────

async function ghostCall<T>(rpc: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`GhostMetaverse RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`GhostMetaverse RPC: ${json.error.message}`);
  return json.result as T;
}

// ─── GhostMetaverse Client ────────────────────────────────────────────────────

export class GhostMetaverse {
  private cfg: GhostMetaverseConfig;

  constructor(config: GhostMetaverseConfig) {
    this.cfg = config;
  }

  // ── Land Parcels ────────────────────────────────────────────────────────────

  /**
   * Fetch a land parcel by its GRC-721 token ID.
   */
  async getParcel(tokenId: bigint): Promise<GhostParcel> {
    const result = await ghostCall<{
      tokenId: string; owner: string; x: number; y: number;
      width: number; height: number; name: string; description: string;
      sceneUri: string; priceGST: string; forSale: boolean; createdAt: number;
    }>(this.cfg.assetsRpc, 'ghost_call', [
      { to: this.cfg.landRegistryAddress, data: encodeCall('getParcel(uint256)', [tokenId]) },
      'latest',
    ]);
    return {
      ...result,
      tokenId: BigInt(result.tokenId),
      priceGST: BigInt(result.priceGST),
    };
  }

  /**
   * List parcels owned by an address.
   */
  async getParcelsOf(owner: string): Promise<GhostParcel[]> {
    const result = await ghostCall<Array<{
      tokenId: string; x: number; y: number; width: number; height: number;
      name: string; description: string; sceneUri: string;
      priceGST: string; forSale: boolean; createdAt: number;
    }>>(this.cfg.assetsRpc, 'ghost_call', [
      { to: this.cfg.landRegistryAddress, data: encodeCall('getParcelsOf(address)', [owner]) },
      'latest',
    ]);
    return result.map(r => ({ ...r, owner, tokenId: BigInt(r.tokenId), priceGST: BigInt(r.priceGST) }));
  }

  /**
   * List parcels for sale (paginated).
   */
  async getMarketParcels(page = 1, limit = 20): Promise<GhostParcel[]> {
    const result = await ghostCall<Array<{
      tokenId: string; owner: string; x: number; y: number; width: number; height: number;
      name: string; description: string; sceneUri: string; priceGST: string; createdAt: number;
    }>>(this.cfg.assetsRpc, 'ghost_call', [
      { to: this.cfg.landRegistryAddress, data: encodeCall('getMarketParcels(uint256,uint256)', [page, limit]) },
      'latest',
    ]);
    return result.map(r => ({ ...r, tokenId: BigInt(r.tokenId), priceGST: BigInt(r.priceGST), forSale: true }));
  }

  /**
   * Buy a parcel from the land market. Returns transaction hash.
   */
  async buyParcel(tokenId: bigint, buyerAddress: string, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.assetsRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * List a parcel for sale at a given GST price.
   */
  async listParcel(tokenId: bigint, priceGST: bigint, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.assetsRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Avatars ─────────────────────────────────────────────────────────────────

  /**
   * Fetch an avatar by GRC-721 token ID.
   */
  async getAvatar(tokenId: bigint): Promise<GhostAvatar> {
    const result = await ghostCall<{
      tokenId: string; owner: string; name: string; modelUri: string;
      wearables: string[]; xp: string; level: number;
      lastPosition: GhostCoord; createdAt: number;
    }>(this.cfg.assetsRpc, 'ghost_call', [
      { to: this.cfg.avatarRegistryAddress, data: encodeCall('getAvatar(uint256)', [tokenId]) },
      'latest',
    ]);
    return {
      ...result,
      tokenId: BigInt(result.tokenId),
      wearables: result.wearables.map(BigInt),
      xp: BigInt(result.xp),
      gstBalance: await this.getGSTBalance(result.owner),
    };
  }

  /**
   * Get the avatar owned by an address (one avatar per address).
   */
  async getAvatarOf(address: string): Promise<GhostAvatar | null> {
    try {
      const tokenId = await ghostCall<string>(this.cfg.assetsRpc, 'ghost_call', [
        { to: this.cfg.avatarRegistryAddress, data: encodeCall('avatarOf(address)', [address]) },
        'latest',
      ]);
      if (!tokenId || tokenId === '0x0') return null;
      return this.getAvatar(BigInt(tokenId));
    } catch { return null; }
  }

  /**
   * Mint an avatar (deploys GRC-721, sends signed tx).
   */
  async mintAvatar(name: string, modelUri: string, ownerAddress: string, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.assetsRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Update avatar position in the world (L3 state update, very cheap gas).
   */
  async updatePosition(avatarTokenId: bigint, position: GhostCoord, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.worldRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Equip a wearable on an avatar.
   */
  async equipWearable(avatarTokenId: bigint, wearableTokenId: bigint, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.assetsRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Wearables ───────────────────────────────────────────────────────────────

  /**
   * Get all wearable token balances for an address.
   */
  async getWearables(address: string): Promise<Array<GhostWearable & { balance: bigint }>> {
    const result = await ghostCall<Array<{
      tokenId: string; name: string; rarity: GhostWearable['rarity']; slot: GhostWearable['slot'];
      modelUri: string; supply: string; priceGST: string; balance: string;
    }>>(this.cfg.assetsRpc, 'ghost_call', [
      { to: this.cfg.wearableAddress, data: encodeCall('getWearablesOf(address)', [address]) },
      'latest',
    ]);
    return result.map(r => ({
      ...r,
      tokenId: BigInt(r.tokenId),
      supply: BigInt(r.supply),
      priceGST: BigInt(r.priceGST),
      balance: BigInt(r.balance),
    }));
  }

  // ── Scenes ──────────────────────────────────────────────────────────────────

  /**
   * Get the current scene for a parcel.
   */
  async getScene(parcelId: bigint): Promise<GhostScene | null> {
    try {
      return await ghostCall<GhostScene>(this.cfg.worldRpc, 'ghost_call', [
        { to: this.cfg.sceneRegistryAddress, data: encodeCall('getScene(uint256)', [parcelId]) },
        'latest',
      ]);
    } catch { return null; }
  }

  /**
   * Publish a scene update for a parcel.
   * Content is stored on GhostCDN / IPFS; only the hash + URI are on-chain.
   */
  async publishScene(parcelId: bigint, contentUri: string, contentHash: string, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.worldRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Portals ─────────────────────────────────────────────────────────────────

  /**
   * List portals in the vicinity of a coordinate (within radius tiles).
   */
  async getNearbyPortals(coord: GhostCoord, radius = 5): Promise<GhostPortal[]> {
    return ghostCall<GhostPortal[]>(this.cfg.worldRpc, 'ghost_call', [
      { to: this.cfg.sceneRegistryAddress, data: encodeCall('getNearbyPortals(int256,int256,int256,uint256)', [coord.x, coord.y, coord.z, radius]) },
      'latest',
    ]);
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  /**
   * List upcoming metaverse events.
   */
  async getUpcomingEvents(limit = 20): Promise<GhostEvent[]> {
    const now = Math.floor(Date.now() / 1000);
    return ghostCall<GhostEvent[]>(this.cfg.worldRpc, 'ghost_call', [
      { to: this.cfg.sceneRegistryAddress, data: encodeCall('getEvents(uint256,uint256)', [now, limit]) },
      'latest',
    ]);
  }

  /**
   * Create a metaverse event on a parcel.
   */
  async createEvent(event: Omit<GhostEvent, 'id' | 'attendees'>, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.worldRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Buy a ticket and join an event.
   */
  async joinEvent(eventId: string, attendee: string, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.worldRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  // ── Economy ─────────────────────────────────────────────────────────────────

  /**
   * GST balance of an address on the metaverse layer (L3).
   */
  async getGSTBalance(address: string): Promise<bigint> {
    const hex = await ghostCall<string>(this.cfg.worldRpc, 'ghost_getBalance', [address, 'latest']);
    return BigInt(hex ?? '0x0');
  }

  /**
   * Send GST between avatars (L3 native transfer, low gas).
   */
  async sendGST(from: string, to: string, amountGST: bigint, signedTx: string): Promise<string> {
    return ghostCall<string>(this.cfg.worldRpc, 'ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * Tip another avatar (microtransaction < 1 GST).
   */
  async tipAvatar(fromAvatar: bigint, toAvatar: bigint, amountWei: bigint, signedTx: string): Promise<string> {
    return this.sendGST(`avatar:${fromAvatar}`, `avatar:${toAvatar}`, amountWei, signedTx);
  }

  // ── World State ─────────────────────────────────────────────────────────────

  /**
   * Get all avatars currently online in a parcel (real-time L3 query).
   */
  async getOnlineAvatars(parcelId: bigint): Promise<Array<{ avatar: bigint; address: string; position: GhostCoord }>> {
    return ghostCall(this.cfg.worldRpc, 'ghost_call', [
      { to: this.cfg.sceneRegistryAddress, data: encodeCall('getOnlineAvatars(uint256)', [parcelId]) },
      'latest',
    ]);
  }

  /**
   * Get GhostChain L3 block number (world tick).
   */
  async worldTick(): Promise<number> {
    const hex = await ghostCall<string>(this.cfg.worldRpc, 'ghost_blockNumber', []);
    return parseInt(hex, 16);
  }

  // ── GNS Integration ─────────────────────────────────────────────────────────

  /**
   * Resolve a GNS name to a parcel or avatar address.
   * e.g. "downtown.ghost" → parcel { tokenId, x, y }
   */
  async resolveGNS(name: string): Promise<{ type: 'parcel' | 'avatar' | 'address'; value: string }> {
    return ghostCall(this.cfg.assetsRpc, 'ghost_gns_resolve', [name]);
  }

  // ── Static Factories ─────────────────────────────────────────────────────────

  /** GhostMetaverse on L3 (default — devnet) */
  static devnet(overrides?: Partial<GhostMetaverseConfig>): GhostMetaverse {
    return new GhostMetaverse({
      worldRpc:              'http://localhost:39545',
      assetsRpc:             'http://localhost:29545',
      registryRpc:           'http://localhost:18545',
      landRegistryAddress:   '0x0000000000000000000000000000000000010001',
      avatarRegistryAddress: '0x0000000000000000000000000000000000010002',
      wearableAddress:       '0x0000000000000000000000000000000000010003',
      sceneRegistryAddress:  '0x0000000000000000000000000000000000010004',
      ...overrides,
    });
  }

  // ── Utilities ────────────────────────────────────────────────────────────────

  /** Format GST wei to human-readable GST string */
  static formatGST(wei: bigint, decimals = 4): string {
    const whole = wei / GST_UNIT;
    const frac  = wei % GST_UNIT;
    const fracStr = frac.toString().padStart(18, '0').slice(0, decimals);
    return `${whole}.${fracStr} GST`;
  }

  /** Build a ghost://parcel deep link */
  static parcelLink(tokenId: bigint): string {
    return `ghost://metaverse/parcel/${tokenId}`;
  }

  /** Build a ghost://avatar deep link */
  static avatarLink(tokenId: bigint): string {
    return `ghost://metaverse/avatar/${tokenId}`;
  }

  /** Build a ghost://event deep link */
  static eventLink(eventId: string): string {
    return `ghost://metaverse/event/${eventId}`;
  }
}

// ─── Internal ABI encoder (minimal, no ethers dependency) ────────────────────

function encodeCall(signature: string, args: unknown[]): string {
  const selector = fnSelector(signature);
  // Minimal encoding: just selector + hex args (sufficient for view calls returning structs)
  const encoded = args.map(a => {
    if (typeof a === 'bigint') return a.toString(16).padStart(64, '0');
    if (typeof a === 'number') return Math.abs(a).toString(16).padStart(64, '0');
    if (typeof a === 'string' && a.startsWith('0x')) return a.slice(2).padStart(64, '0');
    if (typeof a === 'string') return Buffer.from(a).toString('hex').padStart(64, '0');
    return '0'.repeat(64);
  }).join('');
  return `0x${selector}${encoded}`;
}

function fnSelector(sig: string): string {
  // FNV-1a approximation (real impl uses keccak256 — use ghost-sdk-core in production)
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type {
  GhostMetaverseConfig,
  GhostCoord,
  GhostParcel,
  GhostAvatar,
  GhostWearable,
  GhostScene,
  GhostPortal,
  GhostEvent,
  MetaverseLayer,
};

// ─── Sub-module exports ───────────────────────────────────────────────────────

export { WorldEngine }       from './world/WorldEngine.js';
export type {
  GhostWorldConfig,
  GhostWorld,
  WorldFilter,
} from './world/WorldEngine.js';

export { AvatarSystem }      from './avatar/AvatarSystem.js';
export type {
  GhostAvatarModel,
  GhostPosition,
  MintAvatarResult,
} from './avatar/AvatarSystem.js';

export { LandNFT }           from './land/LandNFT.js';
export type {
  MintResult,
  NeighborMap,
} from './land/LandNFT.js';

export { EconomyEngine }     from './economy/EconomyEngine.js';
export type {
  PricePoint,
  ItemListing,
  PurchaseReceipt,
  TreasurySummary,
  RoyaltySplit,
} from './economy/EconomyEngine.js';

export { Multiplayer }       from './multiplayer/Multiplayer.js';
export type {
  PlayerState,
  WorldSession,
  ChatMessage,
  UnsubscribeFn,
} from './multiplayer/Multiplayer.js';
