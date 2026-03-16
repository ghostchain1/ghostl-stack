/**
 * EconomyEngine — GhostMetaverse GST-Powered Economy
 *
 * Handles all in-metaverse economic activity: item purchases, GST transfers,
 * marketplace listings, royalty splits, and treasury reporting.
 *
 * All GST balances and transactions use GhostChain L3 (chain_id 903).
 * Cross-layer withdrawals route L3 → L2 → L1 per GhostChain routing law.
 */

const L3_RPC         = 'http://localhost:39545';
const GST_UNIT       = 10n ** 18n;
const PLATFORM_FEE_BPS = 250n;   // 2.5 %
const MAX_ROYALTY_BPS  = 1000n;  // 10 % cap

export interface PricePoint {
  timestamp: number;
  priceGST:  bigint;
  volume:    bigint;   // number of units sold
}

export interface ItemListing {
  itemId:       string;
  name:         string;
  sellerAddress: string;
  priceGST:     bigint;
  royaltyBps:   bigint;    // creator royalty in basis points
  creatorAddress: string;
  available:    boolean;
  listedAt:     number;
}

export interface PurchaseReceipt {
  txHash:        string;
  buyerAddress:  string;
  sellerAddress: string;
  itemId:        string;
  priceGST:      bigint;
  platformFeeGST: bigint;
  royaltyGST:    bigint;
  sellerRevenue: bigint;
  blockNumber:   bigint;
}

export interface TreasurySummary {
  totalVolumeGST: bigint;
  feesCollectedGST: bigint;
  activeListings: number;
  topItemIds:     string[];
}

export interface RoyaltySplit {
  creatorShare:  bigint;
  platformShare: bigint;
  sellerRevenue: bigint;
}

// ─── EconomyEngine ────────────────────────────────────────────────────────────

export class EconomyEngine {
  private rpc:       string;
  private listings:  Map<string, ItemListing>   = new Map();
  private history:   Map<string, PricePoint[]>  = new Map();
  private totalFees: bigint                      = 0n;
  private totalVol:  bigint                      = 0n;

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Get the GST balance for a wallet address on L3.
   */
  async getBalance(address: string): Promise<bigint> {
    const hex = await this.rpcCall<string>('ghost_getBalance', [address, 'latest']);
    return BigInt(hex);
  }

  /**
   * Transfer GST from one address to another on L3.
   *
   * @param signedTx  Signed transfer transaction from GhostWallet
   */
  async transferGST(signedTx: string): Promise<string> {
    return this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
  }

  /**
   * List an item for sale in the metaverse marketplace.
   *
   * @param itemId         Unique item identifier (e.g. GRC-1155 token id)
   * @param name           Display name
   * @param sellerAddress  Seller's wallet
   * @param priceGST       Ask price in GST (wei units)
   * @param royaltyBps     Creator royalty basis points (capped at MAX_ROYALTY_BPS)
   * @param creatorAddress Creator wallet (receives royalty on each sale)
   */
  listItem(
    itemId: string,
    name: string,
    sellerAddress: string,
    priceGST: bigint,
    royaltyBps: bigint,
    creatorAddress: string,
  ): ItemListing {
    const cappedRoyalty = royaltyBps > MAX_ROYALTY_BPS ? MAX_ROYALTY_BPS : royaltyBps;

    const listing: ItemListing = {
      itemId,
      name,
      sellerAddress,
      priceGST,
      royaltyBps:     cappedRoyalty,
      creatorAddress,
      available:      true,
      listedAt:       Date.now(),
    };

    this.listings.set(itemId, listing);
    return listing;
  }

  /**
   * Purchase a listed item, splitting proceeds among seller, creator, and platform.
   *
   * @param buyerAddress  Buyer's wallet
   * @param itemId        Item to purchase
   * @param signedTx      Signed purchase transaction (must cover priceGST)
   */
  async purchaseItem(buyerAddress: string, itemId: string, signedTx: string): Promise<PurchaseReceipt> {
    const listing = this.listings.get(itemId);
    if (!listing)           throw new Error(`EconomyEngine: item '${itemId}' not found`);
    if (!listing.available) throw new Error(`EconomyEngine: item '${itemId}' is no longer available`);

    const txHash = await this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
    const receipt = await this.waitForReceipt(txHash);

    const split = this.applyRoyalty(listing.priceGST, listing.creatorAddress, listing.royaltyBps);

    // Record history
    const pricePoints = this.history.get(itemId) ?? [];
    pricePoints.push({ timestamp: Date.now(), priceGST: listing.priceGST, volume: 1n });
    this.history.set(itemId, pricePoints);

    this.totalFees += split.platformShare;
    this.totalVol  += listing.priceGST;

    // Mark sold (single-unit listing: becomes unavailable)
    listing.available = false;

    return {
      txHash,
      buyerAddress,
      sellerAddress:  listing.sellerAddress,
      itemId,
      priceGST:       listing.priceGST,
      platformFeeGST: split.platformShare,
      royaltyGST:     split.creatorShare,
      sellerRevenue:  split.sellerRevenue,
      blockNumber:    BigInt(receipt.blockNumber),
    };
  }

  /**
   * Delist an item from sale.
   */
  delistItem(itemId: string, sellerAddress: string): void {
    const listing = this.listings.get(itemId);
    if (!listing) return;
    if (listing.sellerAddress.toLowerCase() !== sellerAddress.toLowerCase()) {
      throw new Error('EconomyEngine: only the seller can delist an item');
    }
    listing.available = false;
  }

  /**
   * Get all active listings.
   */
  getListings(onlyAvailable = true): ItemListing[] {
    return Array.from(this.listings.values())
      .filter(l => !onlyAvailable || l.available);
  }

  /**
   * Get price history for an item over the last N days.
   */
  getPriceHistory(itemId: string, days: number): PricePoint[] {
    const cutoff = Date.now() - days * 86_400_000;
    const all    = this.history.get(itemId) ?? [];
    return all.filter(p => p.timestamp >= cutoff);
  }

  /**
   * Compute royalty and platform fee split for a sale.
   */
  applyRoyalty(saleAmountGST: bigint, _creatorAddress: string, royaltyBps: bigint): RoyaltySplit {
    const cappedRoyalty  = royaltyBps > MAX_ROYALTY_BPS ? MAX_ROYALTY_BPS : royaltyBps;
    const platformShare  = (saleAmountGST * PLATFORM_FEE_BPS) / 10_000n;
    const creatorShare   = (saleAmountGST * cappedRoyalty)     / 10_000n;
    const sellerRevenue  = saleAmountGST - platformShare - creatorShare;

    return { creatorShare, platformShare, sellerRevenue };
  }

  /**
   * Treasury summary — aggregate economy stats.
   */
  getTreasury(): TreasurySummary {
    const byVolume = [...this.history.entries()]
      .map(([id, pts]) => ({ id, vol: pts.reduce((s, p) => s + p.volume, 0n) }))
      .sort((a, b) => (b.vol > a.vol ? 1 : -1))
      .slice(0, 5)
      .map(e => e.id);

    return {
      totalVolumeGST:    this.totalVol,
      feesCollectedGST:  this.totalFees,
      activeListings:    Array.from(this.listings.values()).filter(l => l.available).length,
      topItemIds:        byVolume,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  static formatGST(weiAmount: bigint, decimals = 4): string {
    const whole = weiAmount / GST_UNIT;
    const frac  = (weiAmount % GST_UNIT) * BigInt(10 ** decimals) / GST_UNIT;
    return `${whole}.${frac.toString().padStart(decimals, '0')} GST`;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`EconomyEngine: ${json.error.message}`);
    return json.result as T;
  }

  private async waitForReceipt(txHash: string): Promise<{ blockNumber: string }> {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r = await this.rpcCall<{ blockNumber: string } | null>('ghost_getTransactionReceipt', [txHash]);
      if (r) return r;
    }
    throw new Error(`EconomyEngine: receipt timeout for ${txHash}`);
  }

  static devnet(): EconomyEngine {
    return new EconomyEngine('http://localhost:39545');
  }
}
