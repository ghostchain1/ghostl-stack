import { Logger } from "../utils/Logger.js";

const log = Logger.create("ValidatorMetrics");

export interface ValidatorMetrics {
  blockNumber: bigint;
  peerCount: number;
  syncing: boolean;
  gasPrice?: bigint;
  pendingTxCount?: number;
  /** Unix ms when collected */
  collectedAt: number;
}

export class GhostValidatorMetrics {
  async collect(rpcUrl: string): Promise<ValidatorMetrics> {
    const [blockHex, peersHex, syncRes, gasPriceHex, pendingHex] = await Promise.all([
      this.rpc(rpcUrl, "eth_blockNumber",         []),
      this.rpc(rpcUrl, "net_peerCount",            []),
      this.rpc(rpcUrl, "eth_syncing",              []),
      this.rpc(rpcUrl, "eth_gasPrice",             []).catch(() => "0x0"),
      this.rpc(rpcUrl, "eth_getBlockTransactionCountByNumber", ["pending"]).catch(() => "0x0"),
    ]);

    const metrics: ValidatorMetrics = {
      blockNumber:    BigInt(blockHex as string),
      peerCount:      parseInt(peersHex as string, 16),
      syncing:        Boolean(syncRes),
      gasPrice:       BigInt(gasPriceHex as string),
      pendingTxCount: parseInt(pendingHex as string, 16),
      collectedAt:    Date.now(),
    };

    log.debug(`Metrics @ ${rpcUrl}: block=${metrics.blockNumber} peers=${metrics.peerCount}`);
    return metrics;
  }

  private async rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
      signal: AbortSignal.timeout(5_000),
    });
    const j = await res.json() as { result: unknown; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }
}
