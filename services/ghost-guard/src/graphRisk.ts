import { ethers } from "ethers";

export type GraphState = {
  peers: Map<string, Array<{ other: string; ts: number }>>;
  out: Map<string, Array<{ other: string; ts: number }>>;
  in: Map<string, Array<{ other: string; ts: number }>>;
};

export function createGraphState(): GraphState {
  return { peers: new Map(), out: new Map(), in: new Map() };
}

function prune(list: Array<{ other: string; ts: number }>, cutoff: number) {
  while (list.length > 0 && list[0]!.ts < cutoff) list.shift();
}

function pushEdge(map: Map<string, Array<{ other: string; ts: number }>>, a: string, b: string, ts: number) {
  const list = map.get(a) ?? [];
  list.push({ other: b, ts });
  map.set(a, list);
}

function uniquePartners(map: Map<string, Array<{ other: string; ts: number }>>, addr: string): Set<string> {
  const list = map.get(addr) ?? [];
  const out = new Set<string>();
  for (const e of list) out.add(e.other);
  return out;
}

export function recordGraphEdge(state: GraphState, fromRaw: string, toRaw: string, nowMs: number, windowMs: number) {
  const from = ethers.getAddress(fromRaw);
  const to = ethers.getAddress(toRaw);
  const cutoff = nowMs - Math.max(1, windowMs);

  pushEdge(state.out, from, to, nowMs);
  pushEdge(state.in, to, from, nowMs);
  pushEdge(state.peers, from, to, nowMs);
  pushEdge(state.peers, to, from, nowMs);

  prune(state.out.get(from) ?? [], cutoff);
  prune(state.in.get(to) ?? [], cutoff);
  prune(state.peers.get(from) ?? [], cutoff);
  prune(state.peers.get(to) ?? [], cutoff);
}

export type GraphRiskInput = {
  from: string;
  to: string;
  blocklist: ReadonlySet<string>;
  windowMs: number;
  state: GraphState;
};

export function computeGraphRisk(input: GraphRiskInput): { score: number; reasons: Array<string>; stats: any } {
  const from = ethers.getAddress(input.from);
  const to = ethers.getAddress(input.to);
  const reasons: Array<string> = [];

  let score = 0;

  const peers1 = uniquePartners(input.state.peers, from);
  const outRecipients = uniquePartners(input.state.out, from);
  const inSendersToRecipient = uniquePartners(input.state.in, to);

  // 1-hop: directly connected to a blocklisted address in the recent interaction graph
  for (const p of peers1) {
    if (input.blocklist.has(p)) {
      score = Math.max(score, 90);
      reasons.push("1-hop to blocklisted");
      break;
    }
  }

  // 2-hop: connected via an intermediary
  if (score < 80) {
    outer: for (const p of peers1) {
      const peers2 = uniquePartners(input.state.peers, p);
      for (const p2 of peers2) {
        if (input.blocklist.has(p2)) {
          score = Math.max(score, 80);
          reasons.push("2-hop to blocklisted");
          break outer;
        }
      }
    }
  }

  // Recipient fan-in: many distinct senders to the same recipient in the window
  if (inSendersToRecipient.size >= 10) {
    score = Math.max(score, 70);
    reasons.push("high recipient fan-in");
  } else if (inSendersToRecipient.size >= 5) {
    score = Math.max(score, 50);
    reasons.push("moderate recipient fan-in");
  }

  // Sender fan-out: one sender touching many recipients
  if (outRecipients.size >= 10) {
    score = Math.max(score, 60);
    reasons.push("high sender fan-out");
  } else if (outRecipients.size >= 5) {
    score = Math.max(score, 40);
    reasons.push("moderate sender fan-out");
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  return {
    score,
    reasons,
    stats: {
      windowSeconds: Math.floor(input.windowMs / 1000),
      fromPeers: peers1.size,
      fromRecipients: outRecipients.size,
      recipientUniqueSenders: inSendersToRecipient.size
    }
  };
}

