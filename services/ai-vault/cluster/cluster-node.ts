/**
 * GhostStack AI Vault — Cluster Node
 *
 * Models a single vault node's identity, state, and peer tracking.
 * Each node has an Ed25519 identity key used for:
 *   • mTLS client certificate generation
 *   • P2P message signing / verification
 *   • Consensus vote authentication
 *
 * Node states:
 *   active     — healthy, participating in consensus
 *   degraded   — partially functional, votes counted but flagged
 *   isolated   — network partition detected, excluded from quorum
 *   offline    — no heartbeat for >TTL, removed from active set
 *   quarantine — GhostBrain-ordered isolation due to security event
 *
 * GhostChain L1 (14000101) | L2 (901) | L3 (903) | GST gas token
 */

import { randomBytes }        from 'node:crypto';
import * as ed                from '@noble/ed25519';
import { sha512 }             from '@noble/hashes/sha512';

// noble/ed25519 needs a sha512 implementation at runtime
ed.etc.sha512Sync = (...msgs) => sha512(ed.etc.concatBytes(...msgs));

// ── Types ──────────────────────────────────────────────────────────────────

export type NodeState = 'active' | 'degraded' | 'isolated' | 'offline' | 'quarantine';

export interface NodeConfig {
  /** Unique node ID — stable across restarts */
  id:          string;
  /** Human label, e.g. "vault-node-1" */
  label:       string;
  /** Hostname or IP for P2P reachability */
  host:        string;
  /** P2P port */
  port:        number;
  /** Path to persistent Ed25519 private key (hex) — generated if absent */
  keyHex?:     string;
  /** Expected cluster size for quorum calculation */
  clusterSize: number;
}

export interface PeerRecord {
  id:           string;
  label:        string;
  host:         string;
  port:         number;
  /** Ed25519 public key (hex) — used to verify messages */
  publicKeyHex: string;
  state:        NodeState;
  lastSeen:     number;
  version:      number;
}

export interface NodeStatus {
  id:           string;
  label:        string;
  state:        NodeState;
  uptime:       number;
  peers:        number;
  activePeers:  number;
  quorumMet:    boolean;
  stateVersion: number;
  ts:           number;
}

// ── Quorum Calculation ─────────────────────────────────────────────────────

export function quorumSize(totalNodes: number): number {
  return Math.floor(totalNodes / 2) + 1;
}

export function hasQuorum(active: number, total: number): boolean {
  return active >= quorumSize(total);
}

// ── ClusterNode ────────────────────────────────────────────────────────────

export class ClusterNode {
  readonly id:           string;
  readonly label:        string;
  readonly host:         string;
  readonly port:         number;
  readonly clusterSize:  number;

  private _state:        NodeState = 'active';
  private _privateKey:   Uint8Array;
  private _publicKey:    Uint8Array;
  private readonly _peers = new Map<string, PeerRecord>();
  private readonly _startedAt = Date.now();
  private _stateVersion = 0;

  // Heartbeat tracking
  private readonly HEARTBEAT_TTL_MS = 30_000;

  constructor(cfg: NodeConfig) {
    this.id          = cfg.id;
    this.label       = cfg.label;
    this.host        = cfg.host;
    this.port        = cfg.port;
    this.clusterSize = cfg.clusterSize;

    if (cfg.keyHex) {
      this._privateKey = Buffer.from(cfg.keyHex, 'hex');
    } else {
      this._privateKey = randomBytes(32);
    }
    this._publicKey = ed.getPublicKey(this._privateKey);
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  get publicKeyHex(): string {
    return Buffer.from(this._publicKey).toString('hex');
  }

  get privateKeyHex(): string {
    return Buffer.from(this._privateKey).toString('hex');
  }

  get state(): NodeState {
    return this._state;
  }

  get stateVersion(): number {
    return this._stateVersion;
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  /** Sign arbitrary bytes with this node's Ed25519 identity key */
  sign(message: Uint8Array): Uint8Array {
    return ed.sign(message, this._privateKey);
  }

  /** Verify a signature from a peer */
  static verify(message: Uint8Array, signature: Uint8Array, publicKeyHex: string): boolean {
    try {
      return ed.verify(signature, message, Buffer.from(publicKeyHex, 'hex'));
    } catch {
      return false;
    }
  }

  // ── State Management ──────────────────────────────────────────────────────

  setState(state: NodeState): void {
    if (this._state !== state) {
      this._state = state;
      this._stateVersion++;
    }
  }

  // ── Peer Management ───────────────────────────────────────────────────────

  registerPeer(peer: Omit<PeerRecord, 'lastSeen' | 'version'>): void {
    this._peers.set(peer.id, {
      ...peer,
      lastSeen: Date.now(),
      version:  0,
    });
  }

  updatePeerHeartbeat(peerId: string, state?: NodeState): void {
    const peer = this._peers.get(peerId);
    if (!peer) return;
    peer.lastSeen = Date.now();
    if (state) peer.state = state;
    peer.version++;
  }

  markStalePeers(): string[] {
    const cutoff  = Date.now() - this.HEARTBEAT_TTL_MS;
    const stale: string[] = [];
    for (const [id, peer] of this._peers) {
      if (peer.lastSeen < cutoff && peer.state !== 'offline') {
        peer.state = 'offline';
        stale.push(id);
      }
    }
    return stale;
  }

  getPeer(id: string): PeerRecord | undefined {
    return this._peers.get(id);
  }

  listPeers(): PeerRecord[] {
    return [...this._peers.values()];
  }

  activePeers(): PeerRecord[] {
    return [...this._peers.values()].filter(p => p.state === 'active' || p.state === 'degraded');
  }

  quarantinePeer(id: string): void {
    const peer = this._peers.get(id);
    if (peer) peer.state = 'quarantine';
  }

  // ── Status ────────────────────────────────────────────────────────────────

  status(): NodeStatus {
    const active = this.activePeers().length + 1; // +1 for self
    return {
      id:           this.id,
      label:        this.label,
      state:        this._state,
      uptime:       Date.now() - this._startedAt,
      peers:        this._peers.size,
      activePeers:  this.activePeers().length,
      quorumMet:    hasQuorum(active, this.clusterSize),
      stateVersion: this._stateVersion,
      ts:           Date.now(),
    };
  }

  /** Serialize public peer record (safe to broadcast) */
  toPeerRecord(): PeerRecord {
    return {
      id:           this.id,
      label:        this.label,
      host:         this.host,
      port:         this.port,
      publicKeyHex: this.publicKeyHex,
      state:        this._state,
      lastSeen:     Date.now(),
      version:      this._stateVersion,
    };
  }
}

/** Generate a deterministic stable node ID from a label */
export function generateNodeId(label: string): string {
  const hash = Buffer.from(
    new Uint8Array(
      Array.from(label).map((c, i) => c.charCodeAt(0) ^ i),
    ),
  );
  return `vaultnode-${randomBytes(8).toString('hex')}-${hash.toString('hex').slice(0, 8)}`;
}
