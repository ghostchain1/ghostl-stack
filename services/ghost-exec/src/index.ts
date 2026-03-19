import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";

// ---------------------------------------------------------------------------
// ghost-exec — GhostChain custom execution engine wrapper
//
// Responsibilities:
//   - Validate and execute EVM transactions against GhostL2 / GhostL3 state
//   - Apply Ghost-native fee policy (GST-denominated)
//   - Expose block execution/simulation endpoint for sequencer and deriver
//   - Enforce routing-law: no direct L3->L1 calls
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7260");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();
const PARENT_CHAIN_ID = LAYER === "L3" ? 901 : 14000101;
const RPC_URL = process.env.GHOST_EXEC_RPC_URL || (LAYER === "L2"
  ? "http://ghostl2:8545"
  : "http://ghostl3:8545");
const GAS_LIMIT_CAP = Number(process.env.GAS_LIMIT_CAP || (LAYER === "L2" ? "30000000" : "20000000"));
const MAX_TX_PER_BLOCK = Number(process.env.MAX_TX_PER_BLOCK || "1000");
const STATE_DIR = process.env.STATE_DIR || "/state";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

const RPC_TIMEOUT_MS = clampInt(process.env.RPC_TIMEOUT_MS, 10_000, 1_000, 120_000);

// ---------------------------------------------------------------------------
// Routing-law guard — L3 cannot target L1 directly
// ---------------------------------------------------------------------------
function assertRoutingLaw(fromChain: number, toChain: number): void {
  if (LAYER === "L3" && toChain === 14000101) {
    throw new Error(
      `routing_violation: L3 (chain ${fromChain}) attempted direct message to L1 (chain ${toChain}). ` +
      "All L3 messages must transit L2 first. See routing-law."
    );
  }
}

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: `ghost_${method}`, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`rpc_http_${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (body.error) throw new Error(body.error.message);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "ghost-exec", layer: LAYER, chainId: CHAIN_ID });
});

app.get("/status", async (_req: Request, res: Response) => {
  try {
    const blockNumber = await rpcCall("blockNumber", []);
    res.json({
      service: "ghost-exec",
      layer: LAYER,
      chainId: CHAIN_ID,
      parentChainId: PARENT_CHAIN_ID,
      blockNumber,
      rpcUrl: RPC_URL,
      gasLimitCap: GAS_LIMIT_CAP,
      maxTxPerBlock: MAX_TX_PER_BLOCK,
    });
  } catch (err) {
    res.status(503).json({ error: "exec_unavailable", detail: String(err) });
  }
});

// Execute a block (called by sequencer or deriver)
app.post("/exec/block", async (req: Request, res: Response) => {
  const { transactions, parentHash, timestamp, gasLimit } = req.body ?? {};
  if (!Array.isArray(transactions)) {
    res.status(400).json({ error: "invalid_request", detail: "transactions array required" });
    return;
  }
  if (gasLimit !== undefined && Number(gasLimit) > GAS_LIMIT_CAP) {
    res.status(400).json({ error: "gas_limit_exceeded", cap: GAS_LIMIT_CAP, requested: gasLimit });
    return;
  }
  if (transactions.length > MAX_TX_PER_BLOCK) {
    res.status(400).json({ error: "tx_count_exceeded", max: MAX_TX_PER_BLOCK, count: transactions.length });
    return;
  }
  try {
    const result = await rpcCall("executeBlock", [{
      transactions,
      parentHash: parentHash ?? null,
      timestamp: timestamp ?? Math.floor(Date.now() / 1000),
      gasLimit: gasLimit ?? GAS_LIMIT_CAP,
    }]);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: "exec_failed", detail: String(err) });
  }
});

// Simulate a single transaction (dry-run)
app.post("/exec/simulate", async (req: Request, res: Response) => {
  const { tx, fromChain, toChain } = req.body ?? {};
  if (!tx) {
    res.status(400).json({ error: "invalid_request", detail: "tx required" });
    return;
  }
  if (fromChain !== undefined && toChain !== undefined) {
    try {
      assertRoutingLaw(Number(fromChain), Number(toChain));
    } catch (routingErr) {
      res.status(403).json({ error: "routing_violation", detail: String(routingErr) });
      return;
    }
  }
  try {
    const result = await rpcCall("call", [tx, "latest"]);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: "simulate_failed", detail: String(err) });
  }
});

// Batch simulate (used by sequencer fee estimation)
app.post("/exec/batch-estimate", async (req: Request, res: Response) => {
  const { txs } = req.body ?? {};
  if (!Array.isArray(txs)) {
    res.status(400).json({ error: "invalid_request", detail: "txs array required" });
    return;
  }
  if (txs.length > MAX_TX_PER_BLOCK) {
    res.status(400).json({ error: "batch_too_large", max: MAX_TX_PER_BLOCK });
    return;
  }
  try {
    const estimates = await Promise.all(
      txs.map((tx: unknown) => rpcCall("estimateGas", [tx]).catch((e: unknown) => ({ error: String(e) })))
    );
    res.json({ ok: true, estimates });
  } catch (err) {
    res.status(500).json({ error: "batch_estimate_failed", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      event: "ghost_exec_started",
      service: "ghost-exec",
      layer: LAYER,
      chainId: CHAIN_ID,
      parentChainId: PARENT_CHAIN_ID,
      port: PORT,
      rpcUrl: RPC_URL,
      gasLimitCap: GAS_LIMIT_CAP,
    })
  );
});
