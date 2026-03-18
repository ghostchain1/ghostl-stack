/**
 * PartnershipDiscovery — catalogue of Ghost-native partners to target.
 */

import logger from "../utils/logger";

export interface Partner {
  id:         string;
  name:       string;
  category:   "wallet" | "exchange" | "defi" | "payments" | "gaming" | "enterprise" | "infrastructure";
  website:    string;
  contacts:   number;
  aum?:       string;
  relevance:  number; // 0-100
  status:     "identified" | "proposed" | "negotiating" | "integrated";
  notes:      string;
}

export const PARTNERS: Partner[] = [
  { id: "p1",  name: "GhostWallet",   category: "wallet",         website: "ghostchain.cloud/wallet",      contacts: 3, relevance: 95, status: "identified", notes: "Primary wallet path for GhostChain accounts" },
  { id: "p2",  name: "GhostConnect",  category: "infrastructure", website: "ghostchain.cloud/connect",     contacts: 2, relevance: 90, status: "identified", notes: "Session relay for GhostWallet and app auth" },
  { id: "p3",  name: "GhostOracle",   category: "infrastructure", website: "ghostchain.cloud/oracle",      contacts: 2, relevance: 88, status: "identified", notes: "Data feeds and settlement signals on GhostL2" },
  { id: "p4",  name: "GhostRPC",      category: "infrastructure", website: "ghostchain.cloud/rpc",         contacts: 1, relevance: 85, status: "proposed",   notes: "Canonical RPC provider for GhostChain and rollups" },
  { id: "p5",  name: "GhostIndex",    category: "infrastructure", website: "ghostchain.cloud/index",       contacts: 1, relevance: 82, status: "identified", notes: "Subgraph-style indexing for GhostChain" },
  { id: "p6",  name: "GhostBridge",   category: "infrastructure", website: "ghostchain.cloud/bridge",      contacts: 2, relevance: 80, status: "identified", notes: "Message relay and bridge proofs across Ghost layers" },
  { id: "p7",  name: "GhostXchange",  category: "defi",           website: "ghostchain.cloud/exchange",    contacts: 1, relevance: 92, status: "identified", notes: "Deep GST liquidity deployment on GhostL2" },
  { id: "p8",  name: "GhostLend",     category: "defi",           website: "ghostchain.cloud/lend",        contacts: 1, relevance: 89, status: "identified", notes: "Credit and lending markets on GhostL2" },
  { id: "p9",  name: "GhostPay",      category: "payments",       website: "ghostchain.cloud/pay",         contacts: 1, relevance: 78, status: "proposed",   notes: "On-ramp and treasury settlement flow for GST" },
  { id: "p10", name: "GhostCheckout", category: "payments",       website: "ghostchain.cloud/checkout",    contacts: 1, relevance: 75, status: "identified", notes: "Embedded GST buy and checkout widgets" },
  { id: "p11", name: "GhostArcade",   category: "gaming",         website: "ghostchain.cloud/arcade",      contacts: 1, relevance: 72, status: "identified", notes: "GhostL3 gaming chain partnership" },
  { id: "p12", name: "GhostLabs",     category: "infrastructure", website: "ghostchain.cloud/labs",        contacts: 2, relevance: 85, status: "identified", notes: "Rollup, proving, and execution research for GhostStack" },
];

export function discoverPartners(category?: string, minRelevance = 0): Partner[] {
  return PARTNERS
    .filter(p => (!category || p.category === category) && p.relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance);
}

export function getPartner(id: string): Partner | undefined {
  return PARTNERS.find(p => p.id === id);
}

export function summaryByCategory(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PARTNERS) {
    out[p.category] = (out[p.category] ?? 0) + 1;
  }
  return out;
}

logger.info(`PartnershipDiscovery: ${PARTNERS.length} partners loaded`);
