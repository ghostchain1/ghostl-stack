import { Logger } from "@ghostchain/devkit";

const log = Logger.create("HealthMonitor");

export interface HealthStatus {
  rpc: boolean;
  validators: boolean;
  bridges: boolean;
  timestamp: string;
}

const ENDPOINTS = {
  rpc:        process.env["L2_RPC_URL"]     ?? "http://127.0.0.1:29547",
  validator:  process.env["L2_RPC_URL"]     ?? "http://127.0.0.1:29547",
  bridge:     process.env["BRIDGE_API_URL"] ?? "http://127.0.0.1:8545",
};

export class GhostHealthMonitor {
  async check(): Promise<HealthStatus> {
    const [rpcOk, validatorOk, bridgeOk] = await Promise.all([
      this.probe(ENDPOINTS.rpc,       "ghost_blockNumber"),
      this.probe(ENDPOINTS.validator, "net_peerCount"),
      this.probe(ENDPOINTS.bridge,    "ghost_blockNumber"),
    ]);

    const status: HealthStatus = {
      rpc:        rpcOk,
      validators: validatorOk,
      bridges:    bridgeOk,
      timestamp:  new Date().toISOString(),
    };

    const allGood = rpcOk && validatorOk && bridgeOk;
    if (!allGood) {
      log.warn(`Health degraded: rpc=${rpcOk} validators=${validatorOk} bridges=${bridgeOk}`);
    } else {
      log.debug("All systems healthy");
    }
    return status;
  }

  private async probe(url: string, method: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params: [] }),
        signal: AbortSignal.timeout(4_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
