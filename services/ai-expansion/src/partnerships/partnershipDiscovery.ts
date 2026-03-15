/**
 * PartnershipDiscovery — catalogue of Web3 & traditional tech partners to target.
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
  { id: "p1",  name: "MetaMask",        category: "wallet",         website: "metamask.io",          contacts: 3, relevance: 95, status: "identified", notes: "Add GhostChain network to MetaMask Snaps" },
  { id: "p2",  name: "WalletConnect",   category: "infrastructure", website: "walletconnect.com",    contacts: 2, relevance: 90, status: "identified", notes: "WalletConnect v2 chain integration" },
  { id: "p3",  name: "Chainlink",       category: "infrastructure", website: "chain.link",           contacts: 2, relevance: 88, status: "identified", notes: "CCIP bridge + Data Feeds on GhostL2" },
  { id: "p4",  name: "Alchemy",         category: "infrastructure", website: "alchemy.com",          contacts: 1, relevance: 85, status: "proposed",   notes: "Node RPC provider for GhostChain" },
  { id: "p5",  name: "The Graph",       category: "infrastructure", website: "thegraph.com",         contacts: 1, relevance: 82, status: "identified", notes: "Subgraph indexing for GhostChain" },
  { id: "p6",  name: "Axelar",          category: "infrastructure", website: "axelar.network",       contacts: 2, relevance: 80, status: "identified", notes: "Cross-chain messaging layer" },
  { id: "p7",  name: "Uniswap",         category: "defi",           website: "uniswap.org",          contacts: 1, relevance: 92, status: "identified", notes: "Deploy Uniswap v4 on GhostL2" },
  { id: "p8",  name: "Aave",            category: "defi",           website: "aave.com",             contacts: 1, relevance: 89, status: "identified", notes: "Aave v3 lending markets on GhostL2" },
  { id: "p9",  name: "Transak",         category: "payments",       website: "transak.com",          contacts: 1, relevance: 78, status: "proposed",   notes: "Fiat on/off-ramp for GST" },
  { id: "p10", name: "MoonPay",         category: "payments",       website: "moonpay.com",          contacts: 1, relevance: 75, status: "identified", notes: "GST buy/sell widget" },
  { id: "p11", name: "Immutable",       category: "gaming",         website: "immutable.com",        contacts: 1, relevance: 72, status: "identified", notes: "GhostL3 gaming chain partnership" },
  { id: "p12", name: "Polygon Labs",    category: "infrastructure", website: "polygon.technology",   contacts: 2, relevance: 85, status: "identified", notes: "zkEVM bridging technology sharing" },
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
