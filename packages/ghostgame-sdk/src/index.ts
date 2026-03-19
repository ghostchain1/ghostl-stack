// GhostGame SDK — On-Chain Gaming Economy for GhostChain
// Powers LitVybzLive and all GhostChain game applications
// All game transactions settle on GhostL3 (chain_id=903)

export interface GhostGameConfig {
  rpc: string;                    // GhostL3 RPC (http://localhost:7270)
  gameRegistryAddress: string;    // on-chain game registry contract
  rewardContractAddress: string;  // GST reward distributor
  authToken?: string;
}

export interface GhostPlayer {
  address: string;
  username: string;
  level: number;
  xp: bigint;
  gstBalance: bigint;
  grcBalance: bigint;
  nftCount: number;
  registeredAt: number;
}

export interface GhostGameSession {
  sessionId: string;
  gameId: string;
  player: string;
  startedAt: number;
  endedAt?: number;
  score: number;
  rewardsEarned: bigint;
  status: 'active' | 'completed' | 'abandoned';
}

export interface GhostLeaderboardEntry {
  rank: number;
  player: string;
  username: string;
  score: number;
  rewardsEarned: bigint;
  period: 'daily' | 'weekly' | 'all-time';
}

export interface GhostRewardEvent {
  player: string;
  reason: 'achievement' | 'level-up' | 'match-win' | 'daily-bonus' | 'referral' | 'milestone';
  amount: bigint;   // GST in wei
  txHash: string;
  timestamp: number;
}

/**
 * GhostGame — complete on-chain gaming SDK.
 * Handles player identity, session management, rewards, and the leaderboard.
 *
 * All economy flows:
 *   In-game fees → L3 treasury (70%) + L2 liquidity (20%) + L1 treasury (10%)
 *
 * @example
 * ```ts
 * import { GhostGame } from '@ghostchain/ghostgame-sdk';
 *
 * const game = new GhostGame({
 *   rpc: 'http://localhost:7270',
 *   gameRegistryAddress: '0x...',
 *   rewardContractAddress: '0x...',
 * });
 *
 * const player = await game.registerPlayer({ address, username: 'ghost_player_1' });
 * const session = await game.startSession({ gameId: 'litvybzlive', player: address });
 * await game.recordScore({ sessionId: session.sessionId, score: 9500 });
 * await game.rewardPlayer({ player: address, reason: 'match-win', amount: 5n * 10n**18n });
 * ```
 */
export class GhostGame {
  private readonly config: GhostGameConfig;

  constructor(config: GhostGameConfig) {
    this.config = config;
  }

  // ─── Player Management ────────────────────────────────────────────────────

  /** Register a new player on-chain */
  async registerPlayer(params: { address: string; username: string }): Promise<GhostPlayer> {
    return this._rpc('ghost_game_registerPlayer', [params]);
  }

  /** Get player profile */
  async getPlayer(address: string): Promise<GhostPlayer> {
    return this._rpc<GhostPlayer>('ghost_game_getPlayer', [{ address }]);
  }

  /** Update player username */
  async updateUsername(address: string, username: string): Promise<string> {
    return this._rpc<string>('ghost_game_updateUsername', [{ address, username }]);
  }

  /** Award XP to a player */
  async awardXP(player: string, xp: bigint): Promise<string> {
    return this._rpc<string>('ghost_game_awardXP', [{ player, xp: xp.toString() }]);
  }

  // ─── Session Management ──────────────────────────────────────────────────

  /** Start a new game session */
  async startSession(params: { gameId: string; player: string }): Promise<GhostGameSession> {
    return this._rpc<GhostGameSession>('ghost_game_startSession', [params]);
  }

  /** Record score update during a session */
  async recordScore(params: { sessionId: string; score: number }): Promise<void> {
    await this._rpc('ghost_game_recordScore', [params]);
  }

  /** End a game session and settle rewards */
  async endSession(sessionId: string): Promise<GhostGameSession> {
    return this._rpc<GhostGameSession>('ghost_game_endSession', [{ sessionId }]);
  }

  /** Get session details */
  async getSession(sessionId: string): Promise<GhostGameSession> {
    return this._rpc<GhostGameSession>('ghost_game_getSession', [{ sessionId }]);
  }

  // ─── Rewards ─────────────────────────────────────────────────────────────

  /**
   * Reward a player with GST.
   * Calls the GhostChain reward distributor contract.
   * Rewards flow: L3 economy → L2 liquidity → L1 treasury.
   */
  async rewardPlayer(params: {
    player: string;
    reason: GhostRewardEvent['reason'];
    amount: bigint;
  }): Promise<GhostRewardEvent> {
    return this._rpc<GhostRewardEvent>('ghost_game_rewardPlayer', [{
      ...params,
      amount: params.amount.toString(),
      rewardContract: this.config.rewardContractAddress,
    }]);
  }

  /** Batch reward multiple players */
  async batchReward(rewards: Array<{ player: string; amount: bigint; reason: GhostRewardEvent['reason'] }>): Promise<string> {
    return this._rpc<string>('ghost_game_batchReward', [{
      rewards: rewards.map(r => ({ ...r, amount: r.amount.toString() })),
      rewardContract: this.config.rewardContractAddress,
    }]);
  }

  /** Claim pending rewards (initiated by player) */
  async claimRewards(player: string): Promise<{ claimed: bigint; txHash: string }> {
    return this._rpc('ghost_game_claimRewards', [{ player, rewardContract: this.config.rewardContractAddress }]);
  }

  /** Get reward history for a player */
  async getRewardHistory(player: string, limit = 50): Promise<GhostRewardEvent[]> {
    return this._rpc<GhostRewardEvent[]>('ghost_game_rewardHistory', [{ player, limit }]);
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  /** Get leaderboard for a game */
  async getLeaderboard(
    gameId: string,
    period: GhostLeaderboardEntry['period'] = 'weekly',
    limit = 100,
  ): Promise<GhostLeaderboardEntry[]> {
    return this._rpc<GhostLeaderboardEntry[]>('ghost_game_leaderboard', [{ gameId, period, limit }]);
  }

  /** Get player rank */
  async getPlayerRank(gameId: string, player: string, period: GhostLeaderboardEntry['period'] = 'weekly'): Promise<number> {
    const result = await this._rpc<{ rank: number }>('ghost_game_playerRank', [{ gameId, player, period }]);
    return result.rank;
  }

  // ─── In-Game Assets (GRC-721 NFTs) ───────────────────────────────────────

  /** Mint a game asset NFT (character, item, skin, etc.) */
  async mintGameAsset(params: {
    to: string;
    gameId: string;
    assetType: string;
    metadata: Record<string, unknown>;
    contractAddress: string;
  }): Promise<{ tokenId: bigint; txHash: string }> {
    return this._rpc('ghost_game_mintAsset', [params]);
  }

  /** Get game assets owned by a player */
  async getPlayerAssets(player: string, gameId: string): Promise<Array<{ contractAddress: string; tokenId: bigint; assetType: string }>> {
    return this._rpc('ghost_game_playerAssets', [{ player, gameId }]);
  }

  // ─── Gift Economy (LitVybzLive) ───────────────────────────────────────────

  /**
   * Send a virtual gift (LitVybzLive feature).
   * Fee split: 70% → creator, 20% → L2 liquidity, 10% → L1 treasury.
   */
  async sendGift(params: {
    sender: string;
    recipient: string;          // creator/streamer address
    giftType: string;
    gstAmount: bigint;
    sessionId?: string;
  }): Promise<{ txHash: string; creatorReceived: bigint; treasuryContribution: bigint }> {
    return this._rpc('ghost_game_sendGift', [{
      ...params,
      gstAmount: params.gstAmount.toString(),
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

    if (!res.ok) throw new Error(`GhostGame RPC error: ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`GhostGame [${method}]: ${json.error.message}`);
    return json.result as T;
  }
}
