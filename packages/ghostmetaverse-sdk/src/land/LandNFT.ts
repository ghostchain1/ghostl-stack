/**
 * LandNFT — GhostMetaverse Land Parcel GRC-721 Token Management
 *
 * Land parcels are GRC-721 tokens on GhostChain L2 (chain_id 901).
 * Ownership is recorded on L2; gameplay state lives on L3.
 * All write operations require a signed transaction from GhostWallet.
 *
 * Grid system: parcels addressed by integer (x, y) coordinates.
 * Each parcel is a 16m × 16m tile in the metaverse world grid.
 */

const L2_RPC         = 'http://localhost:29547';
const LAND_REGISTRY  = '0x0000000000000000000000000000000000010001';

export type GhostCoord = { x: number; y: number };

export interface GhostParcel {
  tokenId:     bigint;
  owner:       string;
  coordinates: GhostCoord;
  name:        string;
  description: string;
  sceneryUri:  string | null;   // ghost:// URI to scene data
  priceGST:    bigint | null;   // null = not listed
  saleOpen:    boolean;
  createdAt:   number;
}

export interface MintResult {
  txHash:  string;
  tokenId: bigint;
  parcel:  GhostParcel;
}

export interface NeighborMap {
  north: GhostParcel | null;
  south: GhostParcel | null;
  east:  GhostParcel | null;
  west:  GhostParcel | null;
}

// ─── LandNFT ──────────────────────────────────────────────────────────────────

export class LandNFT {
  private rpc:   string;
  private cache: Map<string, GhostParcel> = new Map();  // key: tokenId string
  private coordIndex: Map<string, bigint> = new Map();  // key: "x,y"

  constructor(rpcUrl: string = L2_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Mint a new land parcel GRC-721 token.
   *
   * @param owner        Receiving wallet address
   * @param coordinates  Grid (x, y) position
   * @param name         Human-readable parcel name
   * @param signedTx     Signed mint transaction
   */
  async mintLand(owner: string, coordinates: GhostCoord, name: string, signedTx: string): Promise<MintResult> {
    const txHash  = await this.send(signedTx);
    const receipt = await this.waitForReceipt(txHash);

    const tokenId = this.coordToTokenId(coordinates);

    const parcel: GhostParcel = {
      tokenId,
      owner,
      coordinates,
      name,
      description: '',
      sceneryUri:  null,
      priceGST:    null,
      saleOpen:    false,
      createdAt:   Date.now(),
    };

    this.cache.set(tokenId.toString(), parcel);
    this.coordIndex.set(`${coordinates.x},${coordinates.y}`, tokenId);

    return { txHash, tokenId, parcel };
  }

  /**
   * Get a land parcel by token ID.
   */
  async getParcel(tokenId: bigint): Promise<GhostParcel | null> {
    const key = tokenId.toString();
    if (this.cache.has(key)) return this.cache.get(key)!;

    // Minimal on-chain read — simplified placeholder (real impl decodes ABI)
    try {
      const data = await this.rpcCall<GhostParcel>('ghost_call', [
        { to: LAND_REGISTRY, data: `0x${this.fnSel('getParcel(uint256)')}${this.padUint(tokenId)}` },
        'latest'
      ]);
      this.cache.set(key, data);
      return data;
    } catch { return null; }
  }

  /**
   * Get a parcel by grid coordinates (returns null if unminted).
   */
  async getParcelAt(coord: GhostCoord): Promise<GhostParcel | null> {
    const existing = this.coordIndex.get(`${coord.x},${coord.y}`);
    if (existing !== undefined) return this.getParcel(existing);
    return null;
  }

  /**
   * Transfer a land parcel to a new owner.
   */
  async transfer(tokenId: bigint, to: string, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) cached.owner = to;

    return txHash;
  }

  /**
   * List a parcel for sale at a given GST price.
   */
  async listForSale(tokenId: bigint, priceGST: bigint, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) { cached.priceGST = priceGST; cached.saleOpen = true; }

    return txHash;
  }

  /**
   * Remove a parcel from sale.
   */
  async delistFromSale(tokenId: bigint, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) { cached.priceGST = null; cached.saleOpen = false; }

    return txHash;
  }

  /**
   * Purchase a listed parcel.
   */
  async buyParcel(tokenId: bigint, buyerAddress: string, signedTx: string): Promise<string> {
    const cached = this.cache.get(tokenId.toString());
    if (cached && !cached.saleOpen) {
      throw new Error(`LandNFT: parcel ${tokenId} is not listed for sale`);
    }

    const txHash = await this.send(signedTx);

    if (cached) {
      cached.owner    = buyerAddress;
      cached.saleOpen = false;
      cached.priceGST = null;
    }

    return txHash;
  }

  /**
   * Get adjacent parcels (N/S/E/W neighbours in the grid).
   */
  async getNeighbors(tokenId: bigint): Promise<NeighborMap> {
    const parcel = await this.getParcel(tokenId);
    if (!parcel) throw new Error(`LandNFT: parcel ${tokenId} not found`);

    const { x, y } = parcel.coordinates;
    const [north, south, east, west] = await Promise.all([
      this.getParcelAt({ x, y: y + 1 }),
      this.getParcelAt({ x, y: y - 1 }),
      this.getParcelAt({ x: x + 1, y }),
      this.getParcelAt({ x: x - 1, y }),
    ]);

    return { north, south, east, west };
  }

  /**
   * Total count of minted parcels (on-chain).
   */
  async totalSupply(): Promise<bigint> {
    const hex = await this.rpcCall<string>('ghost_call', [
      { to: LAND_REGISTRY, data: `0x${this.fnSel('totalSupply()')}` },
      'latest'
    ]);
    return typeof hex === 'string' ? BigInt(hex) : BigInt(this.cache.size);
  }

  /**
   * All parcels currently listed for sale.
   */
  listedParcels(): GhostParcel[] {
    return Array.from(this.cache.values()).filter(p => p.saleOpen);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Convert grid (x, y) to a deterministic token ID.
   * Uses 20-bit Cantor pairing: tokenId = (x+1000)*4000 + (y+1000)
   */
  private coordToTokenId(c: GhostCoord): bigint {
    const shifted_x = c.x + 1000;
    const shifted_y = c.y + 1000;
    return BigInt(shifted_x * 4000 + shifted_y);
  }

  private async send(signedTx: string): Promise<string> {
    return this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
  }

  private async waitForReceipt(_txHash: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r = await this.rpcCall<unknown | null>('ghost_getTransactionReceipt', [_txHash]);
      if (r) return;
    }
    throw new Error(`LandNFT: receipt timeout for ${_txHash}`);
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`LandNFT: ${json.error.message}`);
    return json.result as T;
  }

  private fnSel(sig: string): string {
    let h = 0x811c9dc5;
    for (const c of new TextEncoder().encode(sig)) {
      h ^= c; h = (h * 0x01000193) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  private padUint(v: bigint): string {
    return v.toString(16).padStart(64, '0');
  }

  static devnet(): LandNFT {
    return new LandNFT('http://localhost:29547');
  }
}
