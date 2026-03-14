/**
 * Knowledge Base — shared ecosystem state store for GAAN agents.
 * Provides a centralised in-memory snapshot of network-wide facts that
 * agents can read and update to inform their decisions.
 */

export interface InfrastructureKnowledge {
  nodeCount:         number;
  onlineNodes:       number;
  avgCpuPercent:     number;
  avgMemoryPercent:  number;
  blockProductionOk: boolean;
  lastUpdated:       number;
}

export interface SecurityKnowledge {
  threatLevel:      "none" | "low" | "medium" | "high" | "critical";
  blockedAddresses: number;
  activeIncidents:  number;
  lastAuditPassed:  boolean;
  lastUpdated:      number;
}

export interface GovernanceKnowledge {
  activeProposals:    number;
  passRate:           number;  // percentage 0-100
  pendingVotes:       number;
  daoParticipation:   number;  // percentage 0-100
  lastUpdated:        number;
}

export interface EcosystemKnowledge {
  tvlUSD:           number;
  validatorCount:   number;
  activeDevs:       number;
  dappCount:        number;
  weeklyTxCount:    number;
  lastUpdated:      number;
}

export interface ArchitectureKnowledge {
  activeProposals:   number;
  upgradesDeployed:  number;
  researchItems:     number;
  currentVersion:    string;
  nextMilestone:     string;
  lastUpdated:       number;
}

export interface KnowledgeBase {
  infrastructure: InfrastructureKnowledge;
  security:       SecurityKnowledge;
  governance:     GovernanceKnowledge;
  ecosystem:      EcosystemKnowledge;
  architecture:   ArchitectureKnowledge;
}

const _store: KnowledgeBase = {
  infrastructure: {
    nodeCount:         6,
    onlineNodes:       4,
    avgCpuPercent:     52,
    avgMemoryPercent:  61,
    blockProductionOk: true,
    lastUpdated:       Date.now(),
  },
  security: {
    threatLevel:      "none",
    blockedAddresses: 4820,
    activeIncidents:  0,
    lastAuditPassed:  true,
    lastUpdated:      Date.now(),
  },
  governance: {
    activeProposals:  2,
    passRate:         74,
    pendingVotes:     1,
    daoParticipation: 23,
    lastUpdated:      Date.now(),
  },
  ecosystem: {
    tvlUSD:        0,
    validatorCount: 14,
    activeDevs:    47,
    dappCount:     12,
    weeklyTxCount: 0,
    lastUpdated:   Date.now(),
  },
  architecture: {
    activeProposals:  3,
    upgradesDeployed: 7,
    researchItems:    3,
    currentVersion:   "2.4.1",
    nextMilestone:    "v3.0 — ZK-rollup integration",
    lastUpdated:      Date.now(),
  },
};

/**
 * Read the entire knowledge base snapshot.
 */
export function getKnowledge(): KnowledgeBase {
  return _store;
}

/**
 * Update a specific domain's knowledge with partial data.
 */
export function updateKnowledge<K extends keyof KnowledgeBase>(
  domain: K,
  updates: Partial<KnowledgeBase[K]>,
): void {
  Object.assign(_store[domain], updates, { lastUpdated: Date.now() });
}

/**
 * Convenience: get a single domain snapshot.
 */
export function getDomainKnowledge<K extends keyof KnowledgeBase>(domain: K): KnowledgeBase[K] {
  return _store[domain];
}
