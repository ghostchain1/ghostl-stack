/**
 * Multiplayer — Real-Time GhostMetaverse Player Networking
 *
 * Tracks online players, broadcasts position updates, relays on-chain chat
 * messages, and provides WebSocket-style subscriptions (polling-based, no
 * external WS library dependency).
 *
 * Position state is anchored to GhostChain L3 (chain_id 903).
 * All state updates use ghost_sendRawTransaction; reads use ghost_call.
 */

const L3_RPC = 'http://localhost:7270';

export interface PlayerState {
  address:    string;
  avatarId:   bigint;
  worldId:    string;
  position:   { x: number; y: number; z: number };
  rotation:   { yaw: number; pitch: number };
  lastSeenAt: number;
  sessionId:  string;
}

export interface WorldSession {
  sessionId:     string;
  worldId:       string;
  playerAddress: string;
  joinedAt:      number;
  onlinePlayers: PlayerState[];
  worldStateSeed: bigint;   // block number at join time
}

export interface ChatMessage {
  from:      string;
  to:        string | 'world';   // 'world' = broadcast to world
  worldId:   string;
  content:   string;
  timestamp: number;
  txHash?:   string;   // set if persisted on-chain
}

export type UnsubscribeFn = () => void;

// ─── Multiplayer ──────────────────────────────────────────────────────────────

export class Multiplayer {
  private rpc:         string;
  private players:     Map<string, PlayerState>       = new Map();  // key: address
  private sessions:    Map<string, WorldSession>      = new Map();  // key: sessionId
  private messages:    Map<string, ChatMessage[]>     = new Map();  // key: worldId
  private subs:        Map<string, ((s: PlayerState[]) => void)[]> = new Map();
  private pollTimers:  Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(rpcUrl: string = L3_RPC) {
    this.rpc = rpcUrl;
  }

  /**
   * Join a metaverse world.  Returns a session object with the current list of
   * online players in that world.
   *
   * @param playerAddress  Wallet address of the player
   * @param avatarId       GRC-721 avatar token ID
   * @param worldId        Target world ID
   */
  async joinWorld(playerAddress: string, avatarId: bigint, worldId: string): Promise<WorldSession> {
    const hex = await this.rpcCall<string>('ghost_blockNumber', []);

    const sessionId = `${playerAddress}-${worldId}-${Date.now()}`;
    const ps: PlayerState = {
      address:    playerAddress,
      avatarId,
      worldId,
      position:   { x: 0, y: 0, z: 0 },
      rotation:   { yaw: 0, pitch: 0 },
      lastSeenAt: Date.now(),
      sessionId,
    };

    this.players.set(playerAddress.toLowerCase(), ps);

    const onlinePlayers = this.getOnlinePlayers(worldId);
    const session: WorldSession = {
      sessionId,
      worldId,
      playerAddress,
      joinedAt:       Date.now(),
      onlinePlayers,
      worldStateSeed: BigInt(hex),
    };

    this.sessions.set(sessionId, session);
    this.notifySubscribers(worldId);
    return session;
  }

  /**
   * Remove a player from a world.
   */
  leaveWorld(playerAddress: string, worldId: string): void {
    const key = playerAddress.toLowerCase();
    const ps  = this.players.get(key);
    if (ps?.worldId === worldId) {
      this.players.delete(key);
      this.notifySubscribers(worldId);
    }

    // Remove all sessions for this player+world
    for (const [sid, session] of this.sessions) {
      if (session.playerAddress === playerAddress && session.worldId === worldId) {
        this.sessions.delete(sid);
      }
    }
  }

  /**
   * Broadcast a position update for a player.
   *
   * Position is stored in local state; an optional signed transaction can be
   * provided to also persist on L3 (omit for high-frequency tick updates).
   */
  async broadcastPosition(
    playerAddress: string,
    position: { x: number; y: number; z: number },
    rotation?: { yaw: number; pitch: number },
    signedTx?: string,
  ): Promise<void> {
    const key = playerAddress.toLowerCase();
    const ps  = this.players.get(key);

    if (ps) {
      ps.position   = position;
      ps.rotation   = rotation ?? ps.rotation;
      ps.lastSeenAt = Date.now();
      this.notifySubscribers(ps.worldId);
    }

    if (signedTx) {
      await this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
    }
  }

  /**
   * Get all online players in a world (stale threshold: 30 s).
   */
  getOnlinePlayers(worldId: string, staleLimitMs = 30_000): PlayerState[] {
    const cutoff = Date.now() - staleLimitMs;
    return Array.from(this.players.values())
      .filter(p => p.worldId === worldId && p.lastSeenAt >= cutoff);
  }

  /**
   * Send a chat message to a player or the whole world.
   *
   * Short messages are stored in-process.  Pass `signedTx` to also
   * write the message to L3 (on-chain public chat).
   */
  async sendMessage(
    from: string,
    to: string | 'world',
    content: string,
    worldId: string,
    signedTx?: string,
  ): Promise<ChatMessage> {
    let txHash: string | undefined;

    if (signedTx) {
      txHash = await this.rpcCall<string>('ghost_sendRawTransaction', [signedTx]);
    }

    const msg: ChatMessage = { from, to, worldId, content, timestamp: Date.now(), txHash };

    const worldMsgs = this.messages.get(worldId) ?? [];
    worldMsgs.push(msg);
    this.messages.set(worldId, worldMsgs);

    return msg;
  }

  /**
   * Retrieve recent chat messages for a world.
   */
  getMessages(worldId: string, limit = 50): ChatMessage[] {
    const all = this.messages.get(worldId) ?? [];
    return all.slice(-limit);
  }

  /**
   * Subscribe to player-state changes for a world.
   * The callback is invoked whenever a player joins, leaves, or moves.
   *
   * Returns an unsubscribe function.
   *
   * @example
   * const unsub = multiplayer.subscribeToWorld("world-1", players => {
   *   console.log("online:", players.length)
   * })
   */
  subscribeToWorld(worldId: string, callback: (players: PlayerState[]) => void): UnsubscribeFn {
    const existing = this.subs.get(worldId) ?? [];
    existing.push(callback);
    this.subs.set(worldId, existing);

    // Start polling loop if not running
    if (!this.pollTimers.has(worldId)) {
      const timer = setInterval(() => {
        this.notifySubscribers(worldId);
      }, 2000);
      this.pollTimers.set(worldId, timer);
    }

    // Immediately emit current state
    callback(this.getOnlinePlayers(worldId));

    return () => {
      const cbs = this.subs.get(worldId) ?? [];
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);

      // Stop polling if no more subscribers
      if ((this.subs.get(worldId) ?? []).length === 0) {
        const timer = this.pollTimers.get(worldId);
        if (timer !== undefined) {
          clearInterval(timer);
          this.pollTimers.delete(worldId);
        }
      }
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private notifySubscribers(worldId: string): void {
    const cbs     = this.subs.get(worldId) ?? [];
    const players = this.getOnlinePlayers(worldId);
    for (const cb of cbs) cb(players);
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const res  = await fetch(this.rpc, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`Multiplayer: ${json.error.message}`);
    return json.result as T;
  }

  static devnet(): Multiplayer {
    return new Multiplayer('http://localhost:7270');
  }
}
