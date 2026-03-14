import { Logger } from "../utils/Logger.js";

const log = Logger.create("RPCMonitor");

export interface RPCHealth {
  url: string;
  online: boolean;
  latencyMs?: number;
  blockNumber?: bigint;
  chainId?: bigint;
  error?: string;
}

export class GhostRPCMonitor {
  async check(url: string): Promise<RPCHealth> {
    const start = Date.now();
    try {
      const blockRes = await this.call(url, "eth_blockNumber", []);
      const chainRes = await this.call(url, "eth_chainId",     []);
      return {
        url,
        online:      true,
        latencyMs:   Date.now() - start,
        blockNumber: BigInt(blockRes as string),
        chainId:     BigInt(chainRes as string),
      };
    } catch (err) {
      return {
        url,
        online:    false,
        latencyMs: Date.now() - start,
        error:     err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkAll(urls: string[]): Promise<RPCHealth[]> {
    const results = await Promise.all(urls.map((u) => this.check(u)));
    const up   = results.filter((r) => r.online).length;
    log.info(`RPC health: ${up}/${results.length} online`);
    return results;
  }

  private async call(url: string, method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
      signal: AbortSignal.timeout(5_000),
    });
    const j = await res.json() as { result: unknown; error?: { message: string } };
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }
}
