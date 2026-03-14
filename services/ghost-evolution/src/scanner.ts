import { fetch } from "undici";
import { FEATURE_CATALOG } from "./catalog.js";
import { DEPLOYER_URL, GHOSTBRAIN_URL, GHOST_L1_RPC, GHOST_L2_RPC, GHOST_L3_RPC } from "./config.js";
import type { FeatureDefinition } from "./catalog.js";

export interface FeatureStatus {
  id:       string;
  name:     string;
  category: string;
  present:  boolean;
  note?:    string;
}

export interface ScanResult {
  scannedAt:        number;
  totalFeatures:    number;
  present:          number;
  missing:          number;
  coveragePct:      number;
  features:         FeatureStatus[];
  upgradePriority:  string[];   // IDs of missing features, ordered by category importance
}

export interface UpgradeProposal {
  id:          string;
  title:       string;
  description: string;
  missingFeatures: string[];
  actions:     ProposalAction[];
  rationale:   string;
  generatedAt: number;
  status:      "draft" | "submitted" | "ratified" | "rejected";
}

export interface ProposalAction {
  type:    "deploy-contract" | "start-service" | "config-change";
  target:  string;
  params?:  Record<string, unknown>;
}

// ── Cached state ──────────────────────────────────────────────────────────────
let lastScan: ScanResult | null = null;
const proposals: UpgradeProposal[] = [];

// ── Helper: probe an HTTP endpoint ───────────────────────────────────────────
async function probe(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Helper: probe chain RPC ───────────────────────────────────────────────────
async function probeRpc(rpc: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    const res = await fetch(rpc, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Helper: list deployed contract artifacts via ghost-deployer ───────────────
async function listDeployedArtifacts(): Promise<Set<string>> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    const res = await fetch(`${DEPLOYER_URL}/artifacts`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return new Set();
    const body = await res.json() as { artifacts?: Array<{ name: string }> };
    return new Set(body.artifacts?.map(a => a.name) ?? []);
  } catch {
    return new Set();
  }
}

// ── Scan ──────────────────────────────────────────────────────────────────────

async function checkFeature(
  f: FeatureDefinition,
  artifacts: Set<string>,
  rpcCache: Map<string, boolean>,
): Promise<FeatureStatus> {
  let present = false;
  let note: string | undefined;

  // Chain RPC probes
  if (f.id === "l1-rpc") {
    present = await getCached(GHOST_L1_RPC, () => probeRpc(GHOST_L1_RPC), rpcCache);
    note    = present ? "L1 responding" : "L1 not reachable";
  } else if (f.id === "l2-rpc") {
    present = await getCached(GHOST_L2_RPC, () => probeRpc(GHOST_L2_RPC), rpcCache);
    note    = present ? "L2 responding" : "L2 not reachable";
  } else if (f.id === "l3-rpc") {
    present = await getCached(GHOST_L3_RPC, () => probeRpc(GHOST_L3_RPC), rpcCache);
    note    = present ? "L3 responding" : "L3 not reachable";
  } else if (f.contractName) {
    present = artifacts.has(f.contractName) || artifacts.has(`${f.contractName}.sol`);
    note    = present ? "artifact found" : "artifact not compiled";
  } else if (f.probeUrl && f.probeUrl.startsWith("http")) {
    present = await getCached(f.probeUrl, () => probe(f.probeUrl!), rpcCache);
    note    = present ? "service online" : "service offline";
  }

  return { id: f.id, name: f.name, category: f.category, present, note };
}

async function getCached(
  key: string,
  fn: () => Promise<boolean>,
  cache: Map<string, boolean>,
): Promise<boolean> {
  if (cache.has(key)) return cache.get(key)!;
  const v = await fn();
  cache.set(key, v);
  return v;
}

export async function runScan(): Promise<ScanResult> {
  const rpcCache  = new Map<string, boolean>();
  const artifacts = await listDeployedArtifacts();

  const statuses = await Promise.all(
    FEATURE_CATALOG.map(f => checkFeature(f, artifacts, rpcCache))
  );

  const present = statuses.filter(s => s.present).length;
  const missing = statuses.length - present;

  // Priority order: infrastructure > contracts > services > ai
  const categoryPriority: Record<string, number> = { infrastructure: 0, contracts: 1, services: 2, ai: 3 };
  const upgradePriority = statuses
    .filter(s => !s.present)
    .sort((a, b) => (categoryPriority[a.category] ?? 9) - (categoryPriority[b.category] ?? 9))
    .map(s => s.id);

  lastScan = {
    scannedAt:       Date.now(),
    totalFeatures:   statuses.length,
    present,
    missing,
    coveragePct:     Math.round((present / statuses.length) * 100),
    features:        statuses,
    upgradePriority,
  };

  return lastScan;
}

export function getLastScan(): ScanResult | null {
  return lastScan;
}

// ── Proposal generation ───────────────────────────────────────────────────────

export async function generateProposal(missingIds?: string[]): Promise<UpgradeProposal> {
  const scan    = lastScan ?? await runScan();
  const targets = missingIds
    ? scan.features.filter(f => !f.present && missingIds.includes(f.id))
    : scan.features.filter(f => !f.present).slice(0, 5); // Top 5 gaps

  const actions: ProposalAction[] = targets.map(f => {
    const def = FEATURE_CATALOG.find(d => d.id === f.id);
    if (def?.contractName) {
      return { type: "deploy-contract" as const, target: def.contractName };
    }
    return { type: "start-service" as const, target: f.id };
  });

  // Request a description from GhostBrain (optional — graceful fallback)
  let rationale = `Automated scan detected ${targets.length} missing feature(s) at ${new Date().toISOString()}.`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`${GHOSTBRAIN_URL}/task`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        type:    "draft-proposal",
        payload: { gaps: targets.map(t => t.name) },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json() as { output?: { rationale?: string } };
      rationale = body.output?.rationale ?? rationale;
    }
  } catch {
    // GhostBrain offline — use default rationale
  }

  const proposal: UpgradeProposal = {
    id:              `prop-${Date.now()}`,
    title:           `GhostStack Evolution Proposal — ${targets.length} upgrade(s)`,
    description:     targets.map(t => `• ${t.name}: ${t.note ?? "missing"}`).join("\n"),
    missingFeatures: targets.map(t => t.id),
    actions,
    rationale,
    generatedAt:     Date.now(),
    status:          "draft",
  };

  proposals.push(proposal);
  return proposal;
}

export function getProposals(): UpgradeProposal[] {
  return proposals.slice().sort((a, b) => b.generatedAt - a.generatedAt);
}

export function getProposal(id: string): UpgradeProposal | undefined {
  return proposals.find(p => p.id === id);
}

export function approveProposal(id: string): boolean {
  const p = proposals.find(pr => pr.id === id);
  if (!p || p.status !== "draft") return false;
  p.status = "submitted";
  return true;
}
