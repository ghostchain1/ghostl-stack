import { v4 as uuidv4 } from "uuid";

export type ServiceType  = "private-chain" | "nft-infra" | "payment-gateway" | "enterprise-blockchain" | "defi-protocol" | "dao-framework";
export type ClientStatus = "active" | "trial" | "suspended" | "cancelled";

export interface SaaSClient {
  id: string;
  name: string;
  service: ServiceType;
  chain: "ghostl2" | "ghostl3" | "ghostchain";
  monthlyFeeUSD: number;
  annualFeeUSD: number;
  status: ClientStatus;
  startDate: number;
  renewalDate: number;
  nodes: number;
  uptimePct: number;
  apiCallsToday: number;
}

function client(
  name: string, service: ServiceType,
  chain: "ghostl2" | "ghostl3" | "ghostchain",
  monthlyFee: number, nodes: number,
  status: ClientStatus, startMonthsAgo: number
): SaaSClient {
  const startDate   = Date.now() - 86_400_000 * 30 * startMonthsAgo;
  const renewalDate = startDate + 86_400_000 * 365;
  return {
    id: uuidv4(), name, service, chain, status,
    monthlyFeeUSD: monthlyFee,
    annualFeeUSD:  monthlyFee * 12,
    startDate, renewalDate, nodes,
    uptimePct:      status === "active" ? +(99 + Math.random()).toFixed(3) : 0,
    apiCallsToday:  status === "active" ? Math.floor(Math.random() * 50_000) + 1_000 : 0,
  };
}

const clients: SaaSClient[] = [
  client("MegaCorp Enterprises",    "enterprise-blockchain", "ghostchain", 15_000,  12, "active",  18),
  client("NovaPay Solutions",        "payment-gateway",       "ghostl2",     4_500,   3, "active",  12),
  client("ArtBlock Studios",         "nft-infra",             "ghostl3",     2_800,   4, "active",   9),
  client("DawnChain Finance",        "defi-protocol",         "ghostl2",     8_200,   6, "active",   8),
  client("GovDAO Foundation",        "dao-framework",         "ghostchain",  3_400,   2, "active",   7),
  client("CloudBridge Corp",         "private-chain",         "ghostl3",    12_000,   8, "active",  14),
  client("SecureSync HealthTech",    "enterprise-blockchain", "ghostchain",  6_800,   5, "active",   5),
  client("QuickPay Global",          "payment-gateway",       "ghostl2",     3_200,   2, "trial",    1),
  client("NeoNFT Marketplace",       "nft-infra",             "ghostl3",     2_400,   3, "trial",    0.5),
  client("VaultChain Capital",       "defi-protocol",         "ghostl2",     9_500,   7, "active",  11),
  client("IdentityX Protocol",       "enterprise-blockchain", "ghostchain",  7_200,   6, "active",   6),
  client("RetailFlow Inc",           "payment-gateway",       "ghostl2",     2_800,   2, "suspended", 4),
  client("Phantom Games Studio",     "nft-infra",             "ghostl3",     1_900,   2, "active",   3),
  client("AeroLogistics DAO",        "dao-framework",         "ghostchain",  4_100,   3, "active",   8),
  client("ChainMed Healthcare",      "private-chain",         "ghostl3",    10_500,   6, "active",  10),
];

const serviceLog: { timestamp: number; clientId: string; action: string }[] = [];

function jitter(base: number, pct = 0.02): number {
  return base * (1 + (Math.random() - 0.5) * pct * 2);
}

export function getClients(opts?: { status?: ClientStatus; service?: ServiceType }): SaaSClient[] {
  return clients.filter((c) =>
    (!opts?.status  || c.status  === opts.status) &&
    (!opts?.service || c.service === opts.service)
  );
}

export function getClient(id: string): SaaSClient | undefined {
  return clients.find((c) => c.id === id);
}

export function getSaaSStats() {
  const active = clients.filter((c) => c.status === "active");
  return {
    totalClients:        clients.length,
    activeClients:       active.length,
    trialClients:        clients.filter((c) => c.status === "trial").length,
    suspendedClients:    clients.filter((c) => c.status === "suspended").length,
    monthlyRevenueUSD:   active.reduce((s, c) => s + c.monthlyFeeUSD, 0),
    annualRevenueUSD:    active.reduce((s, c) => s + c.annualFeeUSD, 0),
    totalNodes:          clients.reduce((s, c) => s + c.nodes, 0),
    avgUptimePct:        active.reduce((s, c) => s + c.uptimePct, 0) / (active.length || 1),
    totalApiCallsToday:  active.reduce((s, c) => s + c.apiCallsToday, 0),
  };
}

export async function provisionService(clientData: { client: string; service: ServiceType; chain?: string; monthlyFeeUSD?: number }): Promise<{ client: string; service: string; status: string; clientId: string }> {
  const chain = (clientData.chain as "ghostl2" | "ghostl3" | "ghostchain") ?? "ghostl3";
  const newClient = client(
    clientData.client, clientData.service, chain,
    clientData.monthlyFeeUSD ?? 3_000, 2, "trial", 0
  );
  clients.push(newClient);
  serviceLog.push({ timestamp: Date.now(), clientId: newClient.id, action: `provisioned ${clientData.service}` });
  return { client: clientData.client, service: clientData.service, status: "active", clientId: newClient.id };
}

export function getServiceLog() { return serviceLog.slice(-100); }

export function tickSaaS(): void {
  for (const c of clients) {
    if (c.status !== "active") continue;
    c.uptimePct      = Math.min(100, jitter(c.uptimePct, 0.001));
    c.apiCallsToday += Math.floor(Math.random() * 200);
  }
}
