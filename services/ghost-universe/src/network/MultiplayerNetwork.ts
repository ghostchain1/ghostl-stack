/**
 * MultiplayerNetwork — Real-time player sync for Ghost Universe
 *
 * Broadcasts player positions, gestures, voice metadata, and chat
 * to all connected WebSocket subscribers per world.
 *
 * Architecture:
 *  - One "room" per worldId (Set of ws.WebSocket connections)
 *  - Messages are typed discriminated unions serialised to JSON
 *  - No binary protocol — JSON over vanilla WebSocket
 *  - Integrates with VoiceSync (lip-sync) and GestureSystem
 */

import { WebSocket, WebSocketServer } from 'ws';

export type NetMessageType =
  | 'player-join'
  | 'player-leave'
  | 'player-move'
  | 'player-gesture'
  | 'player-voice'
  | 'world-chat'
  | 'world-event'
  | 'ping'
  | 'pong';

export interface NetMessage {
  type:      NetMessageType;
  worldId:   string;
  from?:     string;           // avatarId
  payload:   Record<string, unknown>;
  timestamp: number;
}

export interface PlayerSession {
  avatarId:  string;
  address:   string;
  worldId:   string;
  ws:        WebSocket;
  joinedAt:  number;
}

// ─── MultiplayerNetwork ───────────────────────────────────────────────────────

export class MultiplayerNetwork {
  /** worldId → Set of connected PlayerSessions */
  private rooms:   Map<string, Set<PlayerSession>> = new Map();

  /** avatarId → PlayerSession */
  private sessions: Map<string, PlayerSession> = new Map();

  private wss: WebSocketServer | null = null;

  /**
   * Attach a WS server created externally (e.g. from api/server.ts).
   */
  attachServer(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: { url?: string }): void {
    // Expect: ws://host/universe/ws?worldId=xxx&avatarId=yyy&address=zzz
    const url     = new URL(req.url ?? '/', 'http://localhost');
    const worldId = url.searchParams.get('worldId')  ?? 'default';
    const avatarId= url.searchParams.get('avatarId') ?? `anon-${Date.now()}`;
    const address = url.searchParams.get('address')  ?? '0x0';

    const session: PlayerSession = { avatarId, address, worldId, ws, joinedAt: Date.now() };
    this.registerSession(session);

    ws.on('message', (raw) => this.handleMessage(session, raw.toString()));
    ws.on('close',   ()    => this.dropSession(session));
    ws.on('error',   ()    => this.dropSession(session));
  }

  private registerSession(session: PlayerSession): void {
    this.sessions.set(session.avatarId, session);

    if (!this.rooms.has(session.worldId)) {
      this.rooms.set(session.worldId, new Set());
    }
    this.rooms.get(session.worldId)!.add(session);

    this.broadcast(session.worldId, {
      type:      'player-join',
      worldId:   session.worldId,
      from:      session.avatarId,
      payload:   { address: session.address },
      timestamp: Date.now(),
    }, session.avatarId);
  }

  private dropSession(session: PlayerSession): void {
    this.sessions.delete(session.avatarId);
    this.rooms.get(session.worldId)?.delete(session);

    this.broadcast(session.worldId, {
      type:      'player-leave',
      worldId:   session.worldId,
      from:      session.avatarId,
      payload:   {},
      timestamp: Date.now(),
    });
  }

  // ── Message routing ───────────────────────────────────────────────────────

  private handleMessage(session: PlayerSession, raw: string): void {
    let msg: NetMessage;
    try { msg = JSON.parse(raw) as NetMessage; }
    catch { return; }

    switch (msg.type) {
      case 'ping':
        this.send(session.ws, { ...msg, type: 'pong', timestamp: Date.now() });
        break;
      case 'player-move':
      case 'player-gesture':
      case 'player-voice':
      case 'world-chat':
        this.broadcast(session.worldId, { ...msg, from: session.avatarId, timestamp: Date.now() }, session.avatarId);
        break;
      default:
        break;
    }
  }

  // ── Public broadcast API ─────────────────────────────────────────────────

  /**
   * Broadcast a message to all players in a world, optionally excluding one.
   */
  broadcast(worldId: string, msg: NetMessage, excludeAvatarId?: string): void {
    const room = this.rooms.get(worldId);
    if (!room) return;
    const payload = JSON.stringify(msg);
    for (const session of room) {
      if (session.avatarId === excludeAvatarId) continue;
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
      }
    }
  }

  /**
   * Send a world-level event (e.g. server-initiated event start).
   */
  broadcastWorldEvent(worldId: string, eventName: string, data: Record<string, unknown>): void {
    this.broadcast(worldId, {
      type:      'world-event',
      worldId,
      payload:   { eventName, ...data },
      timestamp: Date.now(),
    });
  }

  /**
   * Number of players online in a world.
   */
  onlineCount(worldId: string): number {
    return this.rooms.get(worldId)?.size ?? 0;
  }

  /**
   * All active sessions for monitoring.
   */
  getAllSessions(): PlayerSession[] {
    return Array.from(this.sessions.values());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(ws: WebSocket, msg: NetMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  static devnet(): MultiplayerNetwork { return new MultiplayerNetwork(); }
}
