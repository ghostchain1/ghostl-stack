// Chain and validator data service — calls C3 BFF API routes

export interface ChainStatus {
  id:               string;
  name:             string;
  chainId:          number;
  status:           "healthy" | "degraded" | "offline";
  blockHeight:      number;
  blockTime:        number;
  tps:              number;
  gasPrice:         string;
  activeValidators: number;
  totalStaked:      string;
  latency:          number;
}

export interface ValidatorSummary {
  address:    string;
  moniker:    string;
  votingPower:number;
  commission: number;
  uptimePct:  number;
  status:     "active" | "jailed" | "unbonding" | "inactive";
}

export async function getChainStatus(): Promise<ChainStatus[]> {
  const res = await fetch("/api/chains/status", { cache: "no-store" });
  if (!res.ok) throw new Error(`chains/status ${res.status}`);
  return res.json();
}

export async function getValidators(): Promise<ValidatorSummary[]> {
  const res = await fetch("/api/chains/validators", { cache: "no-store" });
  if (!res.ok) throw new Error(`chains/validators ${res.status}`);
  return res.json();
}

export async function restartNode(nodeId: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch("/api/infra/restart", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ nodeId }),
  });
  return res.json();
}
