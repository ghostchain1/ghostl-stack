/**
 * NodeVerifier — verifies GhostChain L1/L2/L3 nodes are responsive.
 */
export class NodeVerifier {
  async check(url: string): Promise<string> {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0",
        id:      1,
        method:  "ghost_chainId",
        params:  [],
      }),
    });

    if (!res.ok) {
      throw new Error(`NodeVerifier: HTTP ${res.status} from ${url}`);
    }

    const json = await res.json() as { result?: string; error?: unknown };
    if (json.error) {
      throw new Error(`NodeVerifier: RPC error from ${url}: ${JSON.stringify(json.error)}`);
    }

    return json.result ?? "unknown";
  }

  async checkAll(nodes: Record<string, string>): Promise<void> {
    const results = await Promise.allSettled(
      Object.entries(nodes).map(async ([name, url]) => {
        const chainId = await this.check(url);
        console.log(`[GhostCode] ${name} online — chainId: ${chainId}`);
      })
    );

    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      throw new Error(`[GhostCode] ${failures.length} node(s) failed health check.`);
    }
  }
}
