/**
 * PartnerDiscovery — scans Web3 companies for potential GhostChain integrations.
 */

import logger from "../utils/logger";

export interface Partner {
  id:           string;
  name:         string;
  category:     "wallet" | "exchange" | "payment" | "gaming" | "infra" | "saas";
  website:      string;
  users:        number;
  integrationFit: number; // 0-100
  status:       "discovered" | "proposed" | "negotiating" | "integrated";
}

const PARTNERS: Partner[] = [
  { id: "par-001", name: "MetaMask",      category: "wallet",   website: "metamask.io",      users: 30_000_000, integrationFit: 95, status: "discovered" },
  { id: "par-002", name: "WalletConnect", category: "wallet",   website: "walletconnect.com", users: 15_000_000, integrationFit: 90, status: "discovered" },
  { id: "par-003", name: "Chainlink",     category: "infra",    website: "chain.link",        users: 0,          integrationFit: 88, status: "proposed" },
  { id: "par-004", name: "TheGraph",      category: "infra",    website: "thegraph.com",      users: 0,          integrationFit: 85, status: "proposed" },
  { id: "par-005", name: "Transak",       category: "payment",  website: "transak.com",       users: 5_000_000,  integrationFit: 80, status: "negotiating" },
  { id: "par-006", name: "Axelar",        category: "infra",    website: "axelar.network",    users: 0,          integrationFit: 92, status: "discovered" },
  { id: "par-007", name: "Biconomy",      category: "infra",    website: "biconomy.io",       users: 2_000_000,  integrationFit: 78, status: "discovered" },
];

export async function scanWeb3Companies(): Promise<Partner[]> {
  logger.info("PartnerDiscovery: scanning Web3 partner landscape");
  return [...PARTNERS].sort((a, b) => b.integrationFit - a.integrationFit);
}

export function getAllPartners(): Partner[] {
  return PARTNERS;
}
