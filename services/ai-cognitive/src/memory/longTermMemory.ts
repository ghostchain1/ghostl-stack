/**
 * GCL — Long-Term Memory
 * Persistent in-memory store of all agent decisions and their outcomes.
 * Agents write here; the learning engine reads here to identify patterns.
 */

import { v4 as uuid } from "uuid";

export interface MemoryEntry {
  id:          string;
  timestamp:   number;
  agent:       string;     // e.g. "strategist-agent"
  domain:      string;     // e.g. "marketing", "security"
  action:      string;     // what was decided
  reasoning:   string;     // why
  outcome:     string;     // what happened
  impact:      "low" | "medium" | "high" | "critical";
  success:     boolean;    // did the outcome meet the goal?
  successScore: number;    // 0.0 – 1.0
  tags:        string[];   // for pattern matching
}

const MAX_ENTRIES = 5_000;
const _store: MemoryEntry[] = [];

// ── Seed with representative history ─────────────────────────────────────────

const hoursAgo = (h: number) => Date.now() - h * 3_600_000;

const SEED: Omit<MemoryEntry, "id">[] = [
  // ── Strategist decisions
  {
    timestamp: hoursAgo(2),  agent: "strategist-agent", domain: "marketing",
    action: "Launch developer grant programme", reasoning: "Developer funnel stagnant 4 weeks",
    outcome: "1,200 new developers onboarded in 30 days", impact: "high",
    success: true, successScore: 0.94,
    tags: ["developer", "grant", "growth", "incentive"],
  },
  {
    timestamp: hoursAgo(10), agent: "strategist-agent", domain: "marketing",
    action: "Activate tier-2 influencer network", reasoning: "Tier-1 CPC too high ($4.20)",
    outcome: "+320K reach; community growth +8%", impact: "medium",
    success: true, successScore: 0.82,
    tags: ["influencer", "marketing", "reach"],
  },
  {
    timestamp: hoursAgo(48), agent: "strategist-agent", domain: "growth",
    action: "Market expansion: Southeast Asia", reasoning: "SEA crypto adoption +48% YoY",
    outcome: "3 regional partnerships formed; $60K budget deployed", impact: "high",
    success: true, successScore: 0.78,
    tags: ["expansion", "partnership", "SEA", "regional"],
  },
  // ── Operator decisions
  {
    timestamp: hoursAgo(3),  agent: "operator-agent", domain: "infrastructure",
    action: "Scale out +2 validator nodes", reasoning: "Network load at 88%; SLA threshold 80%",
    outcome: "Load reduced to 54%; SLA restored; no block gap", impact: "high",
    success: true, successScore: 0.96,
    tags: ["scaling", "validator", "load", "infrastructure"],
  },
  {
    timestamp: hoursAgo(18), agent: "operator-agent", domain: "infrastructure",
    action: "Rollback GhostL2 sequencer v2.4.1", reasoning: "Error rate spike post-deploy",
    outcome: "Stable version restored in 92s; error rate baseline", impact: "high",
    success: true, successScore: 0.88,
    tags: ["rollback", "sequencer", "deploy", "error"],
  },
  // ── Security / Defender decisions
  {
    timestamp: hoursAgo(5),  agent: "security-agent", domain: "security",
    action: "Elevate DDoS protection tier", reasoning: "API traffic 340% above baseline",
    outcome: "Attack blocked; 2,340 IPs banned; 0% packet loss", impact: "critical",
    success: true, successScore: 0.99,
    tags: ["ddos", "security", "mitigation", "traffic"],
  },
  {
    timestamp: hoursAgo(22), agent: "defender-agent", domain: "security",
    action: "Isolate compromised RPC node", reasoning: "Admin call from unknown IP",
    outcome: "Node isolated; forensic log captured; 0 user impact", impact: "critical",
    success: true, successScore: 0.95,
    tags: ["rpc", "isolation", "security", "insider"],
  },
  // ── Architect decisions
  {
    timestamp: hoursAgo(8),  agent: "architect-agent", domain: "architecture",
    action: "Design validator sharding scheme", reasoning: "Validator set growth → decentralisation risk",
    outcome: "Sharding spec complete; 30% load reduction projected", impact: "high",
    success: true, successScore: 0.85,
    tags: ["sharding", "validator", "architecture", "design"],
  },
  // ── Economy decisions
  {
    timestamp: hoursAgo(6),  agent: "economy-agent", domain: "economy",
    action: "Execute token burn — 340K GST", reasoning: "Buy-back threshold met",
    outcome: "Supply reduced 0.034%; price impact +0.8%", impact: "high",
    success: true, successScore: 0.91,
    tags: ["burn", "tokenomics", "supply", "economy"],
  },
  {
    timestamp: hoursAgo(30), agent: "economy-agent", domain: "economy",
    action: "Adjust emission schedule — reduce 2.1%", reasoning: "Inflation above 4% target",
    outcome: "Inflation back to 3.8%; validator revenue slightly lower", impact: "medium",
    success: true, successScore: 0.73,
    tags: ["emission", "inflation", "tokenomics"],
  },
  // ── Governance decisions
  {
    timestamp: hoursAgo(12), agent: "governance-agent", domain: "governance",
    action: "Generate GIP-047: validator reward increase", reasoning: "Validator exodus risk",
    outcome: "Proposal passed 74% yes; +8% rewards activated", impact: "high",
    success: true, successScore: 0.88,
    tags: ["governance", "proposal", "validator", "reward"],
  },
  // ── Auditor — failure case
  {
    timestamp: hoursAgo(14), agent: "auditor-agent", domain: "security",
    action: "Block bridge contract deployment", reasoning: "Reentrancy vulnerability found",
    outcome: "Deployment blocked; dev notified; fix ETA 4h", impact: "critical",
    success: true, successScore: 0.97,
    tags: ["audit", "vulnerability", "bridge", "security"],
  },
];

export function seedMemory(): void {
  for (const entry of SEED) {
    _store.push({ id: uuid(), ...entry });
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function saveMemory(entry: Omit<MemoryEntry, "id" | "timestamp">): MemoryEntry {
  const full: MemoryEntry = { id: uuid(), timestamp: Date.now(), ...entry };
  _store.push(full);
  if (_store.length > MAX_ENTRIES) _store.shift(); // rolling window
  return full;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getAllMemory(): MemoryEntry[] {
  return [..._store];
}

export function getMemoryByAgent(agent: string): MemoryEntry[] {
  return _store.filter(m => m.agent === agent);
}

export function getMemoryByDomain(domain: string): MemoryEntry[] {
  return _store.filter(m => m.domain === domain);
}

export function getSuccessfulMemory(): MemoryEntry[] {
  return _store.filter(m => m.success && m.successScore >= 0.7);
}

export function getRecentMemory(limit = 50): MemoryEntry[] {
  return [..._store].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export function getMemoryStats(): {
  total: number; successful: number; avgSuccessScore: number;
  domains: Record<string, number>; agents: Record<string, number>;
} {
  const domains: Record<string, number> = {};
  const agents:  Record<string, number> = {};
  let totalScore = 0;
  let successCount = 0;

  for (const m of _store) {
    domains[m.domain] = (domains[m.domain] ?? 0) + 1;
    agents[m.agent]   = (agents[m.agent]   ?? 0) + 1;
    totalScore += m.successScore;
    if (m.success) successCount++;
  }

  return {
    total:           _store.length,
    successful:      successCount,
    avgSuccessScore: _store.length > 0 ? Math.round((totalScore / _store.length) * 100) / 100 : 0,
    domains,
    agents,
  };
}
