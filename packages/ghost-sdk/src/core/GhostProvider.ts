/**
 * GhostProvider — sovereign RPC engine replacing ethers JsonRpcProvider.
 * All methods use ghost_* namespace instead of eth_*.
 */
export class GhostProvider {
  readonly rpc: string;

  constructor(rpc: string) {
    this.rpc = rpc;
  }

  async call(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(this.rpc, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0",
        id:      Date.now(),
        method,
        params,
      }),
    });

    if (!res.ok) {
      throw new Error(`GhostProvider HTTP error: ${res.status}`);
    }

    const json = await res.json() as { result?: unknown; error?: { message: string } };

    if (json.error) {
      throw new Error(`GhostRPC error: ${json.error.message}`);
    }

    return json.result;
  }

  async getBlock(block: number | "latest"): Promise<unknown> {
    return this.call("ghost_getBlockByNumber", [block, true]);
  }

  async getBalance(address: string): Promise<string> {
    return this.call("ghost_getBalance", [address, "latest"]) as Promise<string>;
  }

  async getTransaction(hash: string): Promise<unknown> {
    return this.call("ghost_getTransactionByHash", [hash]);
  }

  async getReceipt(hash: string): Promise<unknown> {
    return this.call("ghost_getTransactionReceipt", [hash]);
  }

  async getLogs(filter: unknown): Promise<unknown[]> {
    return this.call("ghost_getLogs", [filter]) as Promise<unknown[]>;
  }

  async chainId(): Promise<string> {
    return this.call("ghost_chainId", []) as Promise<string>;
  }
}
