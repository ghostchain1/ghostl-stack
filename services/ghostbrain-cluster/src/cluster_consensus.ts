/**
 * GhostBrain Cluster — Leader Consensus (Heartbeat / Bully-inspired)
 *
 * Leader election rules:
 *  1. Leader = active node with highest priority (CLUSTER_PRIORITY env; default 0).
 *  2. If two peers share the same priority, lexicographically higher nodeId wins.
 *  3. A node is "active" if its last heartbeat arrived within LEADER_TIMEOUT_MS.
 *  4. Every HEARTBEAT_INTERVAL_MS this node broadcasts a heartbeat to all peers.
 *  5. If current leader goes silent, all nodes autonomously recompute the winner.
 */

import { request } from "undici";
import {
  CLUSTER_NODE_ID,
  CLUSTER_NODE_URL,
  CLUSTER_PRIORITY,
  getClusterPeers,
  upsertClusterPeer,
} from "./cluster_node.js";
import type { HeartbeatMessage } from "./types.js";
import { clusterHmacHeaders } from "./cluster_hmac.js";

const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? "3000");
const LEADER_TIMEOUT_MS     = Number(process.env.LEADER_TIMEOUT_MS     ?? "9000");

let _term    = 0;
let _leaderId: string | null = null;
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// ── Local heartbeat state of all known nodes ──────────────────────────────────

interface NodeHeartbeat {
  priority: number;
  lastBeat: number;
  isLeader: boolean;
}
const _beats = new Map<string, NodeHeartbeat>();

// Seed our own heartbeat
_beats.set(CLUSTER_NODE_ID, { priority: CLUSTER_PRIORITY, lastBeat: Date.now(), isLeader: false });

// ── Ingest incoming heartbeat ─────────────────────────────────────────────────

export function receiveHeartbeat(msg: HeartbeatMessage): void {
  _beats.set(msg.nodeId, { priority: msg.priority, lastBeat: msg.ts, isLeader: msg.isLeader });
  upsertClusterPeer({
    nodeId:   msg.nodeId,
    url:      msg.nodeUrl,
    priority: msg.priority,
    isLeader: msg.isLeader,
    lastSeen: msg.ts,
  });
  reelectLeader();
}

// ── Leader computation ────────────────────────────────────────────────────────

function reelectLeader(): void {
  const cutoff  = Date.now() - LEADER_TIMEOUT_MS;
  // Include self
  const candidates: { nodeId: string; priority: number }[] = [];

  // Self
  candidates.push({ nodeId: CLUSTER_NODE_ID, priority: CLUSTER_PRIORITY });

  // Active peers
  for (const [id, b] of _beats) {
    if (id === CLUSTER_NODE_ID) continue;
    if (b.lastBeat >= cutoff) {
      candidates.push({ nodeId: id, priority: b.priority });
    }
  }

  // Sort: highest priority first; tie-break by nodeId descending
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.nodeId > a.nodeId ? 1 : -1;
  });

  const winner = candidates[0]?.nodeId ?? CLUSTER_NODE_ID;
  if (winner !== _leaderId) {
    _term++;
    _leaderId = winner;
  }
}

export function isLeader(): boolean { return _leaderId === CLUSTER_NODE_ID; }
export function currentLeader(): string | null { return _leaderId; }
export function currentTerm(): number { return _term; }

// ── Broadcast heartbeat ───────────────────────────────────────────────────────

async function broadcastHeartbeat(): Promise<void> {
  reelectLeader();
  const msg: HeartbeatMessage = {
    nodeId:   CLUSTER_NODE_ID,
    nodeUrl:  CLUSTER_NODE_URL,
    priority: CLUSTER_PRIORITY,
    isLeader: isLeader(),
    term:     _term,
    ts:       Date.now(),
  };
  _beats.set(CLUSTER_NODE_ID, { priority: CLUSTER_PRIORITY, lastBeat: msg.ts, isLeader: msg.isLeader });

  const peers = getClusterPeers().filter(p => p.nodeId !== CLUSTER_NODE_ID && p.url);
  await Promise.allSettled(
    peers.map(peer =>
      request(`${peer.url}/api/v1/cluster/heartbeat`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...clusterHmacHeaders(CLUSTER_NODE_ID),
        },
        body:    JSON.stringify(msg),
        bodyTimeout: 3_000,
      }).catch(() => { /* unreachable peer */ })
    )
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startConsensusLoop(): void {
  if (_heartbeatTimer) return;
  reelectLeader();
  _heartbeatTimer = setInterval(broadcastHeartbeat, HEARTBEAT_INTERVAL_MS);
}

export function stopConsensusLoop(): void {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}
