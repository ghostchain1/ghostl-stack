/**
 * @file GhostJsonRpc.ts
 * @description GhostChain JSON-RPC 2.0 client.
 * Uses the ghost_ RPC namespace — never eth_.
 *
 * GhostChain RPC methods map:
 *   ghost_getBalance          ← replaces eth_getBalance
 *   ghost_blockNumber         ← replaces eth_blockNumber
 *   ghost_call                ← replaces eth_call
 *   ghost_sendRawTransaction  ← replaces eth_sendRawTransaction
 *   ghost_chainId             ← replaces eth_chainId
 */

export class GhostJsonRpc {
  readonly url: string;
  private _id = 1;

  constructor(url: string) {
    this.url = url;
  }

  async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    if (method.startsWith("eth_")) {
      throw new Error(
        `[GhostJsonRpc] Forbidden eth_ method: "${method}". Use ghost_ namespace.`
      );
    }

    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this._id++, method, params }),
    });

    if (!res.ok) throw new Error(`RPC HTTP ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result as T;
  }

  // ─── Convenience methods ─────────────────────────────────────────────────

  getBalance(address: string, block = "latest"): Promise<string> {
    return this.request("ghost_getBalance", [address, block]);
  }

  getBlockNumber(): Promise<string> {
    return this.request("ghost_blockNumber");
  }

  call(tx: { to: string; data: string }, block = "latest"): Promise<string> {
    return this.request("ghost_call", [tx, block]);
  }

  sendRawTransaction(signedTx: string): Promise<string> {
    return this.request("ghost_sendRawTransaction", [signedTx]);
  }

  getChainId(): Promise<string> {
    return this.request("ghost_chainId");
  }
}
