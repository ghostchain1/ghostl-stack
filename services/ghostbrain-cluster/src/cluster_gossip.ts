/**
 * GhostBrain Cluster — Gossip Protocol
 *
 * Push-pull gossip: every GOSSIP_INTERVAL_MS, select FANOUT random peers
 * and POST our current state. Peers respond with their own state.
 * We merge returned peer lists to discover new nodes (anti-entropy).
 *
 * The gossip endpoint (/api/v1/cluster/gossip) is registered in cluster routes.
 */

import { request } from "undici";
import {
  CLUSTER_NODE_ID,
  CLUSTER_NODE_URL,
  CLUSTER_PRIORITY,
  getClusterPeers,
  upsertClusterPeer,
} from "./cluster_node.js";
import type { GossipMessage } from "./types.js";
import { clusterHmacHeaders } from "./cluster_hmac.js";

const GOSSIP_INTERVAL_MS = Number(process.env.GOSSIP_INTERVAL_MS ?? "5000");
const FANOUT             = 3; // peers per gossip round

let _gossipVersion = 0;
let _gossipTimer: ReturnType<typeof setInterval> | null = null;

// ── Build outgoing gossip payload ─────────────────────────────────────────────

function buildGossipMessage(): GossipMessage {
  _gossipVersion++;
  return {
    nodeId:   CLUSTER_NODE_ID,
    nodeUrl:  CLUSTER_NODE_URL,
    priority: CLUSTER_PRIORITY,
    version:  _gossipVersion,
    peers:    getClusterPeers().map(p => ({
      nodeId:   p.nodeId,
      url:      p.url,
      lastSeen: p.lastSeen,
      priority: p.priority,
    })),
    ts: Date.now(),
  };
}

// ── Merge incoming gossip ─────────────────────────────────────────────────────

export function mergeGossip(msg: GossipMessage): void {
  // Upsert the sending node
  upsertClusterPeer({
    nodeId:   msg.nodeId,
    url:      msg.nodeUrl,
    priority: msg.priority,
    isLeader: false, // leader state is updated via heartbeat
  });

  // Merge their peer list (anti-entropy)
  for (const p of msg.peers) {
    if (p.nodeId === CLUSTER_NODE_ID) continue; // don't add self
    const existing = getClusterPeers().find(x => x.nodeId === p.nodeId);
    if (!existing || p.lastSeen > existing.lastSeen) {
      upsertClusterPeer({ nodeId: p.nodeId, url: p.url, priority: p.priority, isLeader: false, lastSeen: p.lastSeen });
    }
  }
}

// ── Select random peers ───────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  while (result.length < n && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(i, 1)[0]!);
  }
  return result;
}

// ── Single gossip round ───────────────────────────────────────────────────────

async function gossipRound(): Promise<void> {
  const peers  = getClusterPeers().filter(p => p.nodeId !== CLUSTER_NODE_ID && p.url);
  const sample = pickRandom(peers, FANOUT);
  const msg    = buildGossipMessage();

  await Promise.allSettled(
    sample.map(async (peer) => {
      try {
        const res = await request(`${peer.url}/api/v1/cluster/gossip`, {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            ...clusterHmacHeaders(CLUSTER_NODE_ID),
          },
          body:    JSON.stringify(msg),
          bodyTimeout: 4_000,
        });
        if (res.statusCode === 200) {
          const reply = await res.body.json() as GossipMessage;
          mergeGossip(reply);
        }
      } catch { /* peer unreachable — will age out via lastSeen */ }
    })
  );
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startGossipLoop(): void {
  if (_gossipTimer) return;
  _gossipTimer = setInterval(gossipRound, GOSSIP_INTERVAL_MS);
}

export function stopGossipLoop(): void {
  if (_gossipTimer) { clearInterval(_gossipTimer); _gossipTimer = null; }
}

export { buildGossipMessage };
