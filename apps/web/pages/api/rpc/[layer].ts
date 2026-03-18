/**
 * /api/rpc/[layer] — Next.js RPC proxy
 *
 * Proxies JSON-RPC calls to the appropriate internal chain RPC endpoint.
 * This prevents leaking internal RPC URLs to the browser.
 *
 * Routes:
 *   POST /api/rpc/l1  → NEXT_PUBLIC_RPC_L1_PROXY (default: http://ghostchain-l1:8545)
 *   POST /api/rpc/l2  → NEXT_PUBLIC_RPC_L2_PROXY (default: http://ghostl2:8545)
 *   POST /api/rpc/l3  → NEXT_PUBLIC_RPC_L3_PROXY (default: http://ghostl3:8545)
 *
 * Usage from browser:
 *   new JsonRpcProvider("/api/rpc/l1")
 *   new JsonRpcProvider("/api/rpc/l2")
 */

import type { NextApiRequest, NextApiResponse } from "next";

// ── Upstream RPC map ──────────────────────────────────────────────────────────

const RPC: Record<string, string> = {
  l1: process.env.NEXT_PUBLIC_RPC_L1_PROXY ?? "http://ghostchain-l1:8545",
  l2: process.env.NEXT_PUBLIC_RPC_L2_PROXY ?? "http://ghostl2:8545",
  l3: process.env.NEXT_PUBLIC_RPC_L3_PROXY ?? "http://ghostl3:8545",
};

// ── Allowed JSON-RPC methods (allowlist prevents internal abuse) ───────────────

const ALLOWED_METHODS = new Set([
  "ghost_chainId",
  "ghost_blockNumber",
  "ghost_getBalance",
  "ghost_getCode",
  "ghost_call",
  "ghost_estimateGas",
  "ghost_gasPrice",
  "ghost_maxPriorityFeePerGas",
  "ghost_feeHistory",
  "ghost_getTransactionCount",
  "ghost_getTransactionByHash",
  "ghost_getTransactionReceipt",
  "ghost_getBlockByHash",
  "ghost_getBlockByNumber",
  "ghost_getLogs",
  "ghost_sendRawTransaction",
  "net_version",
  "web3_clientVersion",
]);

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  const layer    = String(req.query["layer"] ?? "").toLowerCase();
  const upstream = RPC[layer];
  if (!upstream) {
    res.status(404).json({ error: `Unknown layer: ${layer}` });
    return;
  }

  // Validate JSON-RPC method against allowlist
  const body = req.body as { method?: string } | undefined;
  const method = body?.method ?? "";
  if (!ALLOWED_METHODS.has(method)) {
    res.status(403).json({ error: `Method not allowed: ${method}` });
    return;
  }

  try {
    const upstream_res = await fetch(upstream, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req.body),
    });

    const text = await upstream_res.text();
    res
      .status(upstream_res.status)
      .setHeader("content-type", "application/json")
      .send(text);
  } catch (e: unknown) {
    res.status(502).json({ error: e instanceof Error ? e.message : "Bad gateway" });
  }
}
