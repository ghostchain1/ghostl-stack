/**
 * AssetMarketplace — Ghost Universe Digital Asset Exchange
 *
 * Users buy and sell avatar skins, vehicles, buildings, wearables,
 * music, and in-world games using GST on GhostChain L3.
 *
 * Revenue flow: sale → platform fee (2.5 %) + creator royalty → L3 → L2 → L1 treasury
 */

const GST_UNIT           = 10n ** 18n;
const PLATFORM_FEE_BPS   = 250n;
const MAX_ROYALTY_BPS    = 1000n;

export type AssetCategory =
  | 'avatar-skin'
  | 'vehicle'
  | 'building'
  | 'wearable'
  | 'music'
  | 'game'
  | 'land-decoration'
  | 'other';

export interface MarketAsset {
  assetId:        string;
  name:           string;
  description:    string;
  category:       AssetCategory;
  creatorAddress: string;
  sellerAddress:  string;
  priceGST:       bigint;
  royaltyBps:     bigint;
  previewUri:     string;   // ghost:// URI to preview image/model
  assetUri:       string;   // ghost:// URI to full asset
  available:      boolean;
  listedAt:       number;
  saleCount:      number;
}

export interface SaleReceipt {
  saleId:          string;
  assetId:         string;
  buyer:           string;
  seller:          string;
  priceGST:        bigint;
  platformFeeGST:  bigint;
  royaltyGST:      bigint;
  sellerRevenue:   bigint;
  timestamp:       number;
}

export interface MarketStats {
  totalListings:   number;
  activeListings:  number;
  totalVolumeGST:  bigint;
  totalFeesGST:    bigint;
  topAssets:       string[];
}

// ─── AssetMarketplace ─────────────────────────────────────────────────────────

export class AssetMarketplace {
  private assets:   Map<string, MarketAsset> = new Map();
  private sales:    SaleReceipt[]            = [];
  private totalVol: bigint                   = 0n;
  private totalFee: bigint                   = 0n;

  /**
   * List a new asset for sale.
   *
   * @example
   * marketplace.listAsset({
   *   assetId: 'skin-001',
   *   name: 'Ghost Knight Skin',
   *   category: 'avatar-skin',
   *   priceGST: 50n * GST_UNIT,
   *   royaltyBps: 500n,
   *   ...
   * })
   */
  listAsset(asset: Omit<MarketAsset, 'available' | 'listedAt' | 'saleCount'>): MarketAsset {
    const royaltyBps = asset.royaltyBps > MAX_ROYALTY_BPS ? MAX_ROYALTY_BPS : asset.royaltyBps;

    const listing: MarketAsset = {
      ...asset,
      royaltyBps,
      available: true,
      listedAt:  Date.now(),
      saleCount: 0,
    };

    this.assets.set(asset.assetId, listing);
    return listing;
  }

  /**
   * Delist an asset (seller only — no address check enforced here; caller enforces).
   */
  delistAsset(assetId: string): void {
    const a = this.assets.get(assetId);
    if (a) a.available = false;
  }

  /**
   * Purchase an asset.
   * In production, payment is handled by a signed tx passed to EconomyLayer.
   * This method records the sale and computes the split.
   */
  purchaseAsset(assetId: string, buyer: string): SaleReceipt {
    const asset = this.assets.get(assetId);
    if (!asset)       throw new Error(`Marketplace: asset '${assetId}' not found`);
    if (!asset.available) throw new Error(`Marketplace: asset '${assetId}' is not available`);

    const platformFee = (asset.priceGST * PLATFORM_FEE_BPS) / 10_000n;
    const royalty     = (asset.priceGST * asset.royaltyBps)  / 10_000n;
    const revenue     = asset.priceGST - platformFee - royalty;

    const receipt: SaleReceipt = {
      saleId:         `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      assetId,
      buyer,
      seller:         asset.sellerAddress,
      priceGST:       asset.priceGST,
      platformFeeGST: platformFee,
      royaltyGST:     royalty,
      sellerRevenue:  revenue,
      timestamp:      Date.now(),
    };

    this.sales.push(receipt);
    this.totalVol += asset.priceGST;
    this.totalFee += platformFee;
    asset.saleCount++;
    asset.available = false;  // single-copy; creator must re-list for duplicate

    return receipt;
  }

  /**
   * Search listings by category and/or keyword in name.
   */
  search(options: { category?: AssetCategory; keyword?: string; maxPriceGST?: bigint }): MarketAsset[] {
    return Array.from(this.assets.values()).filter(a => {
      if (!a.available)                                       return false;
      if (options.category && a.category !== options.category) return false;
      if (options.keyword  && !a.name.toLowerCase().includes(options.keyword.toLowerCase())) return false;
      if (options.maxPriceGST !== undefined && a.priceGST > options.maxPriceGST) return false;
      return true;
    });
  }

  /** Get an asset by ID. */
  getAsset(assetId: string): MarketAsset | null {
    return this.assets.get(assetId) ?? null;
  }

  /** Get sale history for an asset. */
  getSaleHistory(assetId: string): SaleReceipt[] {
    return this.sales.filter(s => s.assetId === assetId);
  }

  /** Aggregate market statistics. */
  getStats(): MarketStats {
    const all     = Array.from(this.assets.values());
    const topN    = [...all].sort((a, b) => b.saleCount - a.saleCount).slice(0, 5).map(a => a.assetId);
    return {
      totalListings:  all.length,
      activeListings: all.filter(a => a.available).length,
      totalVolumeGST: this.totalVol,
      totalFeesGST:   this.totalFee,
      topAssets:      topN,
    };
  }

  static formatGST(wei: bigint, dp = 4): string {
    const whole = wei / GST_UNIT;
    const frac  = (wei % GST_UNIT) * BigInt(10 ** dp) / GST_UNIT;
    return `${whole}.${frac.toString().padStart(dp, '0')} GST`;
  }
}
