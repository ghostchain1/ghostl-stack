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
  { id: "par-001", name: "GhostWallet", category: "wallet",  website: "ghostchain.cloud/wallet",      users: 30_000_000, integrationFit: 95, status: "discovered" },
  { id: "par-002", name: "GhostConnect", category: "wallet",  website: "ghostchain.cloud/connect",     users: 15_000_000, integrationFit: 90, status: "discovered" },
  { id: "par-003", name: "GhostOracle",  category: "infra",   website: "ghostchain.cloud/oracle",      users: 0,          integrationFit: 88, status: "proposed" },
  { id: "par-004", name: "GhostIndex",   category: "infra",   website: "ghostchain.cloud/index",       users: 0,          integrationFit: 85, status: "proposed" },
  { id: "par-005", name: "GhostPay",     category: "payment", website: "ghostchain.cloud/pay",         users: 5_000_000,  integrationFit: 80, status: "negotiating" },
  { id: "par-006", name: "GhostBridge",  category: "infra",   website: "ghostchain.cloud/bridge",      users: 0,          integrationFit: 92, status: "discovered" },
  { id: "par-007", name: "GhostRouter",  category: "infra",   website: "ghostchain.cloud/router",      users: 2_000_000,  integrationFit: 78, status: "discovered" },
];

export async function scanWeb3Companies(): Promise<Partner[]> {
  logger.info("PartnerDiscovery: scanning Web3 partner landscape");
  return [...PARTNERS].sort((a, b) => b.integrationFit - a.integrationFit);
}

export function getAllPartners(): Partner[] {
  return PARTNERS;
}
