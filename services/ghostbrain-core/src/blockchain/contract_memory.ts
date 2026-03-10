/**
 * GhostBrain — Smart Contract Memory Engine
 *
 * Tracks deployed contracts across L1 / L2 / L3, stores ABI
 * summaries in the knowledge base, and provides semantic recall
 * so the AI can identify similar contracts and infer risk.
 */

import { storeVector, search } from "../memory/vector_memory.js";
import { log } from "../observability/event_logger.js";
import type { ChainLayer } from "./ghostchain_ai.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeployedContract {
  address:      string;
  layer:        ChainLayer;
  chainId:      number;
  name:         string;
  /** Selector → function signature */
  selectors:    Record<string, string>;
  deployedAt:   number;
  deployer?:    string;
  verified:     boolean;
  riskScore:    number;  // 0–1
  tags:         string[];
}

export interface ContractRecall {
  contract:  DeployedContract;
  score:     number;
  source:    "vector" | "knowledge";
}

// ── Internal state ─────────────────────────────────────────────────────────────

/** address (lowercase) → DeployedContract */
const _contracts = new Map<string, DeployedContract>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function contractKey(address: string, layer: ChainLayer): string {
  return `${layer}:${address.toLowerCase()}`;
}

function contractToText(c: DeployedContract): string {
  const sigs = Object.values(c.selectors).join(", ");
  return `contract ${c.name} on ${c.layer} (${c.address}) tags=[${c.tags.join(",")}] selectors=[${sigs}]`;
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Register or update a deployed contract in the memory system.
 */
export function registerContract(contract: DeployedContract): void {
  const key = contractKey(contract.address, contract.layer);
  _contracts.set(key, contract);

  // Store in vector memory for semantic recall
  const text = contractToText(contract);
  storeVector(key, text, {
    address:   contract.address,
    layer:     contract.layer,
    chainId:   contract.chainId,
    name:      contract.name,
    riskScore: contract.riskScore,
    tags:      contract.tags,
  });

  log.debug("contract_memory: registered", `${contract.name} on ${contract.layer} (${contract.address})`);
}

/**
 * Find contracts similar to a natural-language description.
 */
export function recallSimilarContracts(query: string, topK = 5): ContractRecall[] {
  const hits = search(query, topK, 0.2);
  const results: ContractRecall[] = [];

  for (const hit of hits) {
    const address = String(hit.metadata.address ?? "");
    const layer   = String(hit.metadata.layer   ?? "l1") as ChainLayer;
    const key     = contractKey(address, layer);
    const contract = _contracts.get(key);
    if (contract) {
      results.push({ contract, score: hit.score, source: "vector" });
    }
  }

  return results;
}

/**
 * Look up a contract by address and layer.
 */
export function getContract(address: string, layer: ChainLayer): DeployedContract | undefined {
  return _contracts.get(contractKey(address, layer));
}

/**
 * Look up what function a selector maps to (scanning registered contracts).
 */
export function resolveSelector(selector: string): string | null {
  for (const contract of _contracts.values()) {
    const sig = contract.selectors[selector];
    if (sig) return `${sig} — ${contract.name} on ${contract.layer}`;
  }
  return null;
}

/**
 * List all known contracts, optionally filtered by layer.
 */
export function listContracts(layer?: ChainLayer): DeployedContract[] {
  const all = [..._contracts.values()];
  return layer ? all.filter(c => c.layer === layer) : all;
}

/**
 * Return high-risk contracts (riskScore >= threshold).
 */
export function getHighRiskContracts(threshold = 0.6): DeployedContract[] {
  return [..._contracts.values()].filter(c => c.riskScore >= threshold);
}

export function getContractMemoryStats() {
  const all = [..._contracts.values()];
  return {
    totalContracts: all.length,
    byLayer: {
      l1: all.filter(c => c.layer === "l1").length,
      l2: all.filter(c => c.layer === "l2").length,
      l3: all.filter(c => c.layer === "l3").length,
    },
    highRisk:    all.filter(c => c.riskScore >= 0.6).length,
    unverified:  all.filter(c => !c.verified).length,
    totalSelectors: all.reduce((n, c) => n + Object.keys(c.selectors).length, 0),
  };
}
