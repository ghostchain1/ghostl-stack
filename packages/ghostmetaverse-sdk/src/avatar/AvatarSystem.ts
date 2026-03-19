/**
 * AvatarSystem — GhostMetaverse Avatar Management
 *
 * Manages GRC-721 avatar tokens on GhostChain L3.
 * Each avatar is a unique on-chain identity with a 3D model URI,
 * XP level, position in the metaverse, and equipped wearables.
 */

const L3_RPC            = 'http://localhost:7270';
const AVATAR_REGISTRY   = '0x0000000000000000000000000000000000010002';

export interface GhostAvatarModel {
  uri:      string;     // ghost:// URI to 3D model asset
  format:   'glb' | 'vrm' | 'ghost3d';
  version:  string;
}

export interface GhostPosition {
  x:       number;
  y:       number;
  z:       number;
  worldId: string;
}

export interface GhostAvatar {
  tokenId:    bigint;
  owner:      string;
  name:       string;
  model:      GhostAvatarModel;
  xp:         bigint;
  level:      number;
  position:   GhostPosition | null;
  wearables:  bigint[];  // GRC-1155 token IDs
  createdAt:  number;
  updatedAt:  number;
}

export interface MintAvatarResult {
  txHash:  string;
  tokenId: bigint;
  avatar:  GhostAvatar;
}

// ─── AvatarSystem ─────────────────────────────────────────────────────────────

export class AvatarSystem {
  private rpc:   string;
  private cache: Map<string, GhostAvatar> = new Map();  // key: tokenId string

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Mint a new avatar GRC-721 token.
   *
   * @param owner      Wallet address that will own the avatar
   * @param name       Avatar display name
   * @param model      3D model specification
   * @param signedTx   Signed mint transaction from GhostWallet
   */
  async mintAvatar(owner: string, name: string, model: GhostAvatarModel, signedTx: string): Promise<MintAvatarResult> {
    const txHash = await this.send(signedTx);
    const receipt = await this.waitForReceipt(txHash);

    // Derive token ID from receipt logs (simplified: use block+logIndex)
    const tokenId = BigInt(receipt.blockNumber) * 1000n + BigInt(receipt.logIndex ?? 0);

    const avatar: GhostAvatar = {
      tokenId,
      owner,
      name,
      model,
      xp:        0n,
      level:     1,
      position:  null,
      wearables: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.cache.set(tokenId.toString(), avatar);
    return { txHash, tokenId, avatar };
  }

  /**
   * Get avatar by token ID.
   */
  async getAvatar(tokenId: bigint): Promise<GhostAvatar | null> {
    const key = tokenId.toString();
    if (this.cache.has(key)) return this.cache.get(key)!;

    // On-chain read via ghost_call to AVATAR_REGISTRY
    try {
      const data = await this.call<GhostAvatar>({ to: AVATAR_REGISTRY, data: this.sel('ownerOf(uint256)') + this.padUint(tokenId) });
      this.cache.set(key, data);
      return data;
    } catch { return null; }
  }

  /**
   * Get the avatar owned by an address (returns first owned token).
   */
  async getAvatarOf(address: string): Promise<GhostAvatar | null> {
    for (const avatar of this.cache.values()) {
      if (avatar.owner.toLowerCase() === address.toLowerCase()) return avatar;
    }
    return null;
  }

  /**
   * Update the avatar's 3D model URI (owner-only, requires signed tx).
   */
  async updateModel(tokenId: bigint, newModel: GhostAvatarModel, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) {
      cached.model     = newModel;
      cached.updatedAt = Date.now();
    }

    return txHash;
  }

  /**
   * Move an avatar to a new world position.
   */
  async moveAvatar(tokenId: bigint, position: GhostPosition, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) {
      cached.position  = position;
      cached.updatedAt = Date.now();
    }

    return txHash;
  }

  /**
   * Grant XP to an avatar (game contract / governance only).
   */
  async grantXP(tokenId: bigint, amount: bigint, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached) {
      cached.xp        += amount;
      cached.level      = this.xpToLevel(cached.xp);
      cached.updatedAt  = Date.now();
    }

    return txHash;
  }

  /**
   * Equip a GRC-1155 wearable item on an avatar (owner-only, signed tx).
   */
  async equipWearable(tokenId: bigint, wearableTokenId: bigint, signedTx: string): Promise<string> {
    const txHash = await this.send(signedTx);

    const cached = this.cache.get(tokenId.toString());
    if (cached && !cached.wearables.includes(wearableTokenId)) {
      cached.wearables.push(wearableTokenId);
      cached.updatedAt = Date.now();
    }

    return txHash;
  }

  /**
   * List all avatars present in a given world.
   */
  listAvatarsInParcel(worldId: string): GhostAvatar[] {
    return Array.from(this.cache.values())
      .filter(a => a.position?.worldId === worldId);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private xpToLevel(xp: bigint): number {
    // Level formula: level = floor(sqrt(xp / 100)) + 1
    return Math.floor(Math.sqrt(Number(xp / 100n))) + 1;
  }

  private async send(signedTx: string): Promise<string> {
    return this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
  }

  private async call<T>(callObj: { to: string; data: string }): Promise<T> {
    return this.rpcCall<T>('ghost_call', [callObj, 'latest']);
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`AvatarSystem: ${json.error.message}`);
    return json.result as T;
  }

  private async waitForReceipt(txHash: string): Promise<{ blockNumber: string; logIndex?: number }> {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const r = await this.rpcCall<{ blockNumber: string; logIndex?: number } | null>(
        'ghost_getTransactionReceipt', [txHash]);
      if (r) return r;
    }
    throw new Error(`AvatarSystem: receipt timeout for ${txHash}`);
  }

  private sel(signature: string): string {
    // FNV-1a 4-byte selector (no external dep)
    let h = 0x811c9dc5;
    for (const c of new TextEncoder().encode(signature)) {
      h ^= c; h = (h * 0x01000193) >>> 0;
    }
    return '0x' + (h >>> 0).toString(16).padStart(8, '0');
  }

  private padUint(v: bigint): string {
    return v.toString(16).padStart(64, '0');
  }

  static devnet(): AvatarSystem {
    return new AvatarSystem('http://localhost:7270');
  }
}
