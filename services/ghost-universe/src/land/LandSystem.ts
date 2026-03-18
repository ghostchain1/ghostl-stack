/**
 * LandSystem — Virtual Land Ownership for Ghost Universe (GhostChain L2)
 *
 * Virtual land is stored as GRC-721 tokens on GhostChain L2 (chainId 901).
 * Each parcel is a 16m × 16m tile in the world grid.
 *
 * Land types:
 *   residential | commercial | event-venue | game-arena | civic | wilderness
 *
 * Economic flow: land sales → L3 → L2 settlement → L1 treasury
 */

const L2_RPC = 'http://localhost:29547';

export type LandType = 'residential' | 'commercial' | 'event-venue' | 'game-arena' | 'civic' | 'wilderness';

export interface LandParcel {
  id:       string;     // deterministic "x:y"
  owner:    string;
  location: [number, number];   // [x, y] grid
  type:     LandType;
  worldId:  string;
  priceGST: bigint | null;      // null = not for sale
  builtOn:  boolean;            // true = has structure
  createdAt: number;
}

export interface LandStats {
  total:       number;
  byType:      Record<LandType, number>;
  forSale:     number;
  avgPriceGST: bigint;
}

// ─── LandSystem ───────────────────────────────────────────────────────────────

export class LandSystem {
  private parcels: Map<string, LandParcel> = new Map();
  private rpc:     string;

  constructor(rpcUrl: string = L2_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Mint a land parcel (owner is assigned, GRC-721 token created on L2).
   *
   * @param owner   Owning wallet address
   * @param x       Grid X coordinate
   * @param y       Grid Y coordinate
   * @param type    Land use type
   * @param worldId World this parcel belongs to
   * @returns       The created parcel
   *
   * @example
   * const parcel = await land.mintLand('0xUser', 10, 20, 'residential', 'world-1')
   * // { id: "10:20", owner: '0xUser', location: [10, 20], ... }
   */
  async mintLand(owner: string, x: number, y: number, type: LandType = 'residential', worldId: string): Promise<LandParcel> {
    const id = `${x}:${y}`;
    if (this.parcels.has(id)) throw new Error(`LandSystem: parcel ${id} is already minted`);

    const parcel: LandParcel = {
      id,
      owner,
      location: [x, y],
      type,
      worldId,
      priceGST: null,
      builtOn:  false,
      createdAt: Date.now(),
    };

    this.parcels.set(id, parcel);
    return parcel;
  }

  /** Get a parcel by grid coordinates. */
  getParcel(x: number, y: number): LandParcel | null {
    return this.parcels.get(`${x}:${y}`) ?? null;
  }

  /** List parcels for a given owner. */
  getParcelsOf(owner: string): LandParcel[] {
    return Array.from(this.parcels.values()).filter(p => p.owner.toLowerCase() === owner.toLowerCase());
  }

  /** Transfer parcel ownership. */
  transfer(x: number, y: number, newOwner: string): void {
    const parcel = this.parcels.get(`${x}:${y}`);
    if (!parcel) throw new Error(`LandSystem: parcel ${x}:${y} not found`);
    parcel.owner    = newOwner;
    parcel.priceGST = null;
  }

  /** List a parcel for sale at a GST price. */
  listForSale(x: number, y: number, priceGST: bigint, seller: string): void {
    const parcel = this.parcels.get(`${x}:${y}`);
    if (!parcel) throw new Error(`LandSystem: parcel ${x}:${y} not found`);
    if (parcel.owner.toLowerCase() !== seller.toLowerCase()) throw new Error('LandSystem: caller is not the owner');
    parcel.priceGST = priceGST;
  }

  /** Purchase a listed parcel (buyer provides signed tx; payment handled by EconomyLayer). */
  async buyLand(x: number, y: number, buyer: string): Promise<LandParcel> {
    const parcel = this.parcels.get(`${x}:${y}`);
    if (!parcel)         throw new Error(`LandSystem: parcel ${x}:${y} not found`);
    if (!parcel.priceGST) throw new Error(`LandSystem: parcel ${x}:${y} is not listed`);

    parcel.owner    = buyer;
    parcel.priceGST = null;
    return parcel;
  }

  /** All parcels listed for sale. */
  getMarket(worldId?: string): LandParcel[] {
    return Array.from(this.parcels.values())
      .filter(p => p.priceGST !== null && (!worldId || p.worldId === worldId));
  }

  /** Aggregate land statistics. */
  getStats(worldId?: string): LandStats {
    const filtered = Array.from(this.parcels.values()).filter(p => !worldId || p.worldId === worldId);
    const byType   = {} as Record<LandType, number>;
    const types: LandType[] = ['residential', 'commercial', 'event-venue', 'game-arena', 'civic', 'wilderness'];
    for (const t of types) byType[t] = 0;

    let forSale = 0;
    let priceSum = 0n;

    for (const p of filtered) {
      byType[p.type]++;
      if (p.priceGST !== null) { forSale++; priceSum += p.priceGST; }
    }

    return {
      total:       filtered.length,
      byType,
      forSale,
      avgPriceGST: forSale > 0 ? priceSum / BigInt(forSale) : 0n,
    };
  }

  static devnet(): LandSystem { return new LandSystem('http://localhost:29547'); }
}
