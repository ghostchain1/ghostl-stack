/**
 * Feature Evolution Engine — discovers and tracks new ecosystem features across GhostStack.
 */

import { v4 as uuid } from "uuid";
import logger          from "../utils/logger";

export type FeatureCategory = "defi" | "nft" | "ai" | "governance" | "gaming" | "privacy" | "data" | "identity" | "social" | "developer-tools";
export type FeatureStatus   = "discovered" | "planning" | "building" | "testing" | "launched" | "deprecated";

export interface EvolvedFeature {
  id:           string;
  name:         string;
  category:     FeatureCategory;
  description:  string;
  benefits:     string[];
  targetChain:  string;
  status:       FeatureStatus;
  complexity:   number;   // 1-10
  roi:          number;   // estimated %
  discoveredAt: number;
  launchedAt?:  number;
  userAdoption?:number;   // users
  devTeam:      number;   // engineer-weeks
}

const MAX_FEATURES = 200;
const store: EvolvedFeature[] = [];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const FEATURE_CATALOGUE: Record<FeatureCategory, { names: string[]; desc: string; benefits: string[] }> = {
  "defi": {
    names:    ["GhostSwap V3 — Concentrated Liquidity", "GhostLend — Algorithmic Money Market", "Ghost Perpetuals DEX", "Yield Optimizer Vaults", "Real-World Asset Bridge"],
    desc:     "Decentralized finance protocol extending the GhostChain liquidity ecosystem",
    benefits: ["Increases TVL", "Generates protocol revenue", "Attracts DeFi users", "Deepens liquidity"],
  },
  "nft": {
    names:    ["Ghost Creator Studio", "Fractional NFT Protocol", "NFT Rental Market", "Dynamic NFT Standard", "Cross-Chain NFT Bridge"],
    desc:     "NFT infrastructure advancing creator economy and digital ownership",
    benefits: ["Attracts creators", "Generates marketplace fees", "Enables new ownership models"],
  },
  "ai": {
    names:    ["AI-Powered Smart Contract Auditor", "On-Chain AI Oracle Network", "Ghost AI Data Marketplace", "Federated Learning Protocol", "AI Agent Settlement Layer"],
    desc:     "Artificial intelligence integration at the protocol and application layers",
    benefits: ["Unique competitive advantage", "Enables AI-native dApps", "Attracts AI developers"],
  },
  "governance": {
    names:    ["Quadratic Voting Module", "Delegation Marketplace", "Cross-Chain DAO Federation", "Governor Reputation System", "Optimistic Proposal Execution"],
    desc:     "Advanced governance tooling for decentralized decision-making",
    benefits: ["Improves governance participation", "Reduces vote apathy", "Enables complex DAO structures"],
  },
  "gaming": {
    names:    ["Ghost Gaming SDK", "On-Chain Achievement System", "Play-to-Earn Framework", "Game Asset Interoperability Layer", "Provably Fair RNG Oracle"],
    desc:     "Blockchain gaming infrastructure and tooling for asset-owning game worlds",
    benefits: ["Opens gaming market", "High user engagement", "New revenue streams from in-game economies"],
  },
  "privacy": {
    names:    ["ZK Identity System", "Private Transaction Pool", "Stealth Address Protocol", "ZK-Proof Aggregator", "Confidential Smart Contracts"],
    desc:     "Privacy-preserving protocols enabling confidential transactions and identity",
    benefits: ["Compliance-friendly privacy", "Attracts enterprise users", "Differentiates from public chains"],
  },
  "data": {
    names:    ["Decentralized Data Indexer", "Ghost Analytics Protocol", "On-Chain Data Streaming", "Decentralized Storage Gateway", "Cross-Chain Data Oracle"],
    desc:     "Data availability and analytics infrastructure for the GhostStack ecosystem",
    benefits: ["Enables data-driven dApps", "Reduces reliance on centralized indexers", "New fee layer"],
  },
  "identity": {
    names:    ["Ghost DID — Decentralized Identity", "Soulbound Token Standard", "Verifiable Credential Registry", "Cross-Chain Identity Bridge", "Ghost Passport NFT"],
    desc:     "Self-sovereign identity infrastructure for the GhostStack ecosystem",
    benefits: ["Enables compliance features", "Reduces Sybil attacks", "Builds reputation systems"],
  },
  "social": {
    names:    ["Ghost Social Graph Protocol", "Decentralized Messaging Layer", "Token-Gated Community Platform", "Creator Subscription Protocol", "Reputation Scoring System"],
    desc:     "Decentralized social infrastructure built on chain-native primitives",
    benefits: ["User acquisition", "Viral growth mechanics", "Content monetization"],
  },
  "developer-tools": {
    names:    ["Ghost Scaffold CLI", "Universal Contract SDK", "Cross-Chain Testing Framework", "Ghost DevNet Faucet", "On-Chain Contract Registry"],
    desc:     "Developer experience tooling to accelerate ecosystem growth",
    benefits: ["Attracts developers", "Reduces onboarding friction", "Increases dApp quality"],
  },
};

const CHAINS = ["GhostChain", "GhostL2", "GhostL3", "GhostChain + GhostL2", "all"];
const STATUSES: FeatureStatus[] = ["discovered","planning","building","testing","launched","deprecated"];

function makeFeature(hoursAgo = 0): EvolvedFeature {
  const category = pick(Object.keys(FEATURE_CATALOGUE) as FeatureCategory[]);
  const entry    = FEATURE_CATALOGUE[category]!;
  const status   = pick(STATUSES);
  const launched = status === "launched";
  return {
    id:           uuid(),
    name:         pick(entry.names),
    category,
    description:  entry.desc,
    benefits:     entry.benefits,
    targetChain:  pick(CHAINS),
    status,
    complexity:   rand(2, 10),
    roi:          rand(20, 450),
    discoveredAt: Date.now() - hoursAgo * 3_600_000,
    devTeam:      rand(2, 24),
    ...(launched ? { launchedAt: Date.now() - rand(1, hoursAgo || 1) * 3_600_000, userAdoption: rand(100, 50_000) } : {}),
  };
}

function seed() {
  for (let i = 0; i < 14; i++) store.push(makeFeature(rand(4, 500)));
  logger.info(`[FeatureEvolution] Seeded ${store.length} features`);
}

export function evolveFeatures(count = 1): EvolvedFeature[] {
  const results: EvolvedFeature[] = [];
  for (let i = 0; i < count; i++) {
    const f = makeFeature(0);
    f.status = "discovered";
    store.unshift(f);
    results.push(f);
  }
  if (store.length > MAX_FEATURES) store.splice(MAX_FEATURES);
  logger.info(`[FeatureEvolution] Discovered ${count} new feature(s): ${results.map(f => f.name).join(", ")}`);
  return results;
}

export function getFeatures(opts: {
  category?: FeatureCategory; status?: FeatureStatus; limit?: number;
} = {}): EvolvedFeature[] {
  let items = [...store];
  if (opts.category) items = items.filter(f => f.category === opts.category);
  if (opts.status)   items = items.filter(f => f.status   === opts.status);
  return items.slice(0, opts.limit ?? 50);
}

export function getFeatureById(id: string): EvolvedFeature | null {
  return store.find(f => f.id === id) ?? null;
}

export function updateFeatureStatus(id: string, status: FeatureStatus): EvolvedFeature | null {
  const f = store.find(x => x.id === id);
  if (!f) return null;
  f.status = status;
  if (status === "launched" && !f.launchedAt) {
    f.launchedAt   = Date.now();
    f.userAdoption = rand(50, 5_000);
  }
  logger.info(`[FeatureEvolution] Feature "${f.name}" → ${status}`);
  return f;
}

export function getFeatureStats() {
  const launched = store.filter(f => f.status === "launched");
  return {
    total:       store.length,
    launched:    launched.length,
    building:    store.filter(f => f.status === "building").length,
    discovered:  store.filter(f => f.status === "discovered").length,
    totalUsers:  launched.reduce((s, f) => s + (f.userAdoption ?? 0), 0),
    avgRoi:      store.length ? Math.round(store.reduce((s, f) => s + f.roi, 0) / store.length) : 0,
    byCategory:  Object.fromEntries((Object.keys(FEATURE_CATALOGUE) as FeatureCategory[]).map(c => [c, store.filter(f => f.category === c).length])),
  };
}

seed();
