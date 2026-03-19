// GhostNFT SDK — GRC-721 / GRC-1155 NFT Engine
// GRC = GhostChain Resource Contract (replaces ERC)

export interface GhostNFTConfig {
  rpc: string;
  authToken?: string;
}

export interface GhostNFTMetadata {
  name: string;
  description: string;
  image: string;          // IPFS URI (ghost:// or ipfs://)
  animationUrl?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
  royaltyBps?: number;    // basis points e.g. 500 = 5%
  royaltyReceiver?: string;
}

export interface GhostNFTInfo {
  contractAddress: string;
  tokenId: bigint;
  owner: string;
  tokenURI: string;
  metadata?: GhostNFTMetadata;
  standard: 'GRC-721' | 'GRC-1155';
}

export interface GhostMarketplaceListing {
  id: string;
  seller: string;
  contractAddress: string;
  tokenId: bigint;
  price: bigint;          // GST in wei
  currency: string;       // token address (use GHOST_ZERO_ADDRESS for native GST)
  active: boolean;
  expiresAt?: number;
}

export const GHOST_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * GhostNFT — complete NFT engine for GhostChain.
 * Implements GRC-721 and GRC-1155 (GhostChain's NFT standards — not ERC).
 *
 * @example
 * ```ts
 * const nft = new GhostNFT({ rpc: 'http://localhost:7270' });
 *
 * // Mint a GRC-721
 * const { tokenId } = await nft.mint({
 *   contractAddress: '0x...',
 *   to: '0x...',
 *   metadata: { name: 'Ghost #1', description: '...', image: 'ipfs://...' },
 * });
 *
 * // List on marketplace
 * await nft.marketplace.list({ contractAddress, tokenId, price: 10n * 10n**18n });
 * ```
 */
export class GhostNFT {
  private readonly config: GhostNFTConfig;
  readonly marketplace: GhostNFTMarketplace;

  constructor(config: GhostNFTConfig) {
    this.config = config;
    this.marketplace = new GhostNFTMarketplace(config);
  }

  /** Mint a new GRC-721 token */
  async mint(params: {
    contractAddress: string;
    to: string;
    tokenId?: bigint;
    metadata: GhostNFTMetadata;
    tokenURI?: string;
  }): Promise<{ txHash: string; tokenId: bigint }> {
    return this._rpc('ghost_nft_mint', [{
      ...params,
      tokenId: params.tokenId?.toString(),
      metadata: JSON.stringify(params.metadata),
    }]);
  }

  /** Batch mint GRC-1155 tokens */
  async batchMint(params: {
    contractAddress: string;
    to: string;
    ids: bigint[];
    amounts: bigint[];
    data?: string;
  }): Promise<string> {
    return this._rpc<string>('ghost_nft_batchMint', [{
      ...params,
      ids: params.ids.map(i => i.toString()),
      amounts: params.amounts.map(a => a.toString()),
    }]);
  }

  /** Transfer a GRC-721 token */
  async transfer(params: {
    contractAddress: string;
    from: string;
    to: string;
    tokenId: bigint;
  }): Promise<string> {
    return this._rpc<string>('ghost_nft_transfer', [{
      ...params,
      tokenId: params.tokenId.toString(),
    }]);
  }

  /** Burn a token */
  async burn(contractAddress: string, tokenId: bigint): Promise<string> {
    return this._rpc<string>('ghost_nft_burn', [{ contractAddress, tokenId: tokenId.toString() }]);
  }

  /** Get token info */
  async getToken(contractAddress: string, tokenId: bigint): Promise<GhostNFTInfo> {
    return this._rpc<GhostNFTInfo>('ghost_nft_getToken', [{ contractAddress, tokenId: tokenId.toString() }]);
  }

  /** Get all tokens owned by an address */
  async tokensOf(contractAddress: string, owner: string): Promise<GhostNFTInfo[]> {
    return this._rpc<GhostNFTInfo[]>('ghost_nft_tokensOf', [{ contractAddress, owner }]);
  }

  /** Get token balance (GRC-1155) */
  async balanceOf(contractAddress: string, owner: string, tokenId: bigint): Promise<bigint> {
    const hex = await this._rpc<string>('ghost_nft_balanceOf', [{ contractAddress, owner, tokenId: tokenId.toString() }]);
    return BigInt(hex);
  }

  /** Deploy a new GRC-721 collection contract */
  async deployCollection(params: {
    name: string;
    symbol: string;
    baseURI: string;
    maxSupply?: bigint;
    royaltyBps?: number;
    royaltyReceiver?: string;
    owner: string;
  }): Promise<{ contractAddress: string; txHash: string }> {
    return this._rpc('ghost_nft_deployCollection', [{
      ...params,
      maxSupply: params.maxSupply?.toString(),
    }]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostNFT RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostNFT [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}

/**
 * GhostNFTMarketplace — list, buy, cancel, and query NFT listings.
 * The marketplace charges fees in GST, paid to the GhostChain treasury.
 */
export class GhostNFTMarketplace {
  private readonly config: GhostNFTConfig;

  constructor(config: GhostNFTConfig) {
    this.config = config;
  }

  async list(params: {
    contractAddress: string;
    tokenId: bigint;
    price: bigint;
    currency?: string;
    expiresAt?: number;
    seller: string;
  }): Promise<{ listingId: string; txHash: string }> {
    return this._rpc('ghost_nft_marketplace_list', [{
      ...params,
      tokenId: params.tokenId.toString(),
      price: params.price.toString(),
      currency: params.currency ?? GHOST_ZERO_ADDRESS,
    }]);
  }

  async buy(listingId: string, buyer: string): Promise<string> {
    return this._rpc<string>('ghost_nft_marketplace_buy', [{ listingId, buyer }]);
  }

  async cancel(listingId: string): Promise<string> {
    return this._rpc<string>('ghost_nft_marketplace_cancel', [{ listingId }]);
  }

  async getListing(listingId: string): Promise<GhostMarketplaceListing> {
    return this._rpc<GhostMarketplaceListing>('ghost_nft_marketplace_getListing', [{ listingId }]);
  }

  async getListings(contractAddress?: string, limit = 50, offset = 0): Promise<GhostMarketplaceListing[]> {
    return this._rpc<GhostMarketplaceListing[]>('ghost_nft_marketplace_getListings', [{ contractAddress, limit, offset }]);
  }

  private async _rpc<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authToken) headers['Authorization'] = `Bearer ${this.config.authToken}`;

    const res = await fetch(this.config.rpc, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

    if (!res.ok) throw new Error(`GhostNFTMarketplace RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostNFTMarketplace [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
