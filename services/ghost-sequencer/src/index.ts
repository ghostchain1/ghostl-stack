import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// ghost-sequencer — GhostChain custom block sequencer
//
// Responsibilities:
//   - Receive transactions into the mempool
//   - Order and batch transactions into blocks (FIFO w/ priority fee ordering)
//   - Apply Ghost-native EIP-1559 fee market (GST-denominated)
//   - Forward sealed blocks to ghost-exec for execution
//   - Forward executed batches to ghost-settlement
//   - Enforce max-tx-per-block and gas-limit-cap
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7261");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();
const EXEC_URL = process.env.GHOST_EXEC_URL || "http://ghost-exec:7260";
const SETTLEMENT_URL = process.env.GHOST_SETTLEMENT_URL || "http://ghost-settlement:7263";
const BLOCK_TIME_MS = Number(process.env.BLOCK_TIME_MS || "2000");
const MAX_TX_PER_BLOCK = Number(process.env.MAX_TX_PER_BLOCK || "1000");
const GAS_LIMIT_CAP = Number(process.env.GAS_LIMIT_CAP || (LAYER === "L2" ? "30000000" : "20000000"));
const STATE_DIR = process.env.STATE_DIR || "/state";
const SEQUENCER_PRIVATE_KEY_FILE = process.env.SEQUENCER_PRIVATE_KEY_FILE || "";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface MempoolTx {
  hash: string;
  from: string;
  to: string | null;
  data: string;
  value: string;
  gas: number;
  maxFeePerGas: number;
  maxPriorityFeePerGas: number;
  nonce: number;
  receivedAt: number;
}

const mempool = new Map<string, MempoolTx>();
let currentBlock = 0n;
let isSealing = false;
let lastSealedAt = 0;
let sealErrors = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readSecret(key: string): Promise<string> {
  const filePath = process.env[`${key}_FILE`] || "";
  if (filePath) {
    try {
      return String(await fs.readFile(filePath, "utf8")).trim();
    } catch { /* ignore */ }
  }
  return process.env[key] || "";
}

function validateTx(tx: Partial<MempoolTx>): string | null {
  if (!tx.hash || typeof tx.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(tx.hash))
    return "invalid_hash";
  if (!tx.from || typeof tx.from !== "string" || !/^0x[0-9a-f]{40}$/i.test(tx.from))
    return "invalid_from";
  if (tx.gas === undefined || typeof tx.gas !== "number" || tx.gas <= 0 || tx.gas > GAS_LIMIT_CAP)
    return "invalid_gas";
  if (tx.maxFeePerGas === undefined || tx.maxFeePerGas < 0)
    return "invalid_max_fee";
  return null;
}

async function callExec(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${EXEC_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`exec_http_${res.status}`);
  return res.json();
}

async function sealBlock(): Promise<void> {
  if (isSealing || mempool.size === 0) return;
  isSealing = true;
  try {
    // Priority ordering: higher maxPriorityFeePerGas first, then FIFO
    const ordered = Array.from(mempool.values())
      .sort((a, b) => b.maxPriorityFeePerGas - a.maxPriorityFeePerGas || a.receivedAt - b.receivedAt)
      .slice(0, MAX_TX_PER_BLOCK);

    const execResult = await callExec("/exec/block", {
      transactions: ordered.map((t) => ({
        hash: t.hash,
        from: t.from,
        to: t.to,
        data: t.data,
        value: t.value,
        gas: t.gas,
        maxFeePerGas: t.maxFeePerGas,
        maxPriorityFeePerGas: t.maxPriorityFeePerGas,
        nonce: t.nonce,
      })),
      timestamp: Math.floor(Date.now() / 1000),
      gasLimit: GAS_LIMIT_CAP,
    }) as { ok: boolean; result?: { blockHash?: string; blockNumber?: string } };

    if (execResult.ok) {
      currentBlock += 1n;
      lastSealedAt = Date.now();
      sealErrors = 0;

      // Remove sealed txs from mempool
      for (const tx of ordered) mempool.delete(tx.hash);

      console.log(JSON.stringify({
        event: "block_sealed",
        blockNumber: currentBlock.toString(),
        txCount: ordered.length,
        execBlockHash: execResult.result?.blockHash,
      }));

      // Forward to settlement asynchronously (non-blocking, settlement handles retry)
      fetch(`${SETTLEMENT_URL}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockNumber: currentBlock.toString(),
          txCount: ordered.length,
          execResult: execResult.result,
          layer: LAYER,
          chainId: CHAIN_ID,
        }),
      }).catch((e: unknown) => {
        console.error(JSON.stringify({ event: "settlement_notify_failed", error: String(e) }));
      });
    } else {
      sealErrors += 1;
      console.error(JSON.stringify({ event: "block_seal_failed", execResult }));
    }
  } catch (err) {
    sealErrors += 1;
    console.error(JSON.stringify({ event: "block_seal_error", error: String(err) }));
  } finally {
    isSealing = false;
  }
}

// ---------------------------------------------------------------------------
// Block timer
// ---------------------------------------------------------------------------
setInterval(() => {
  sealBlock().catch((e: unknown) => {
    console.error(JSON.stringify({ event: "seal_tick_error", error: String(e) }));
  });
}, BLOCK_TIME_MS);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ghost-sequencer",
    layer: LAYER,
    chainId: CHAIN_ID,
    mempoolSize: mempool.size,
  });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    service: "ghost-sequencer",
    layer: LAYER,
    chainId: CHAIN_ID,
    currentBlock: currentBlock.toString(),
    mempoolSize: mempool.size,
    lastSealedAt,
    sealErrors,
    blockTimeMs: BLOCK_TIME_MS,
    maxTxPerBlock: MAX_TX_PER_BLOCK,
    gasLimitCap: GAS_LIMIT_CAP,
  });
});

// Submit transaction to mempool
app.post("/mempool/submit", (req: Request, res: Response) => {
  const tx = req.body as Partial<MempoolTx>;
  const err = validateTx(tx);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  if (mempool.has(tx.hash!)) {
    res.status(409).json({ error: "tx_already_in_mempool", hash: tx.hash });
    return;
  }
  const fullTx: MempoolTx = {
    hash: tx.hash!,
    from: tx.from!,
    to: tx.to ?? null,
    data: tx.data ?? "0x",
    value: tx.value ?? "0x0",
    gas: tx.gas!,
    maxFeePerGas: tx.maxFeePerGas ?? 0,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 0,
    nonce: tx.nonce ?? 0,
    receivedAt: Date.now(),
  };
  mempool.set(fullTx.hash, fullTx);
  res.json({ ok: true, hash: fullTx.hash, mempoolSize: mempool.size });
});

// Get mempool snapshot
app.get("/mempool", (_req: Request, res: Response) => {
  res.json({
    size: mempool.size,
    txs: Array.from(mempool.values()).map((t) => ({
      hash: t.hash,
      from: t.from,
      gas: t.gas,
      maxPriorityFeePerGas: t.maxPriorityFeePerGas,
      receivedAt: t.receivedAt,
    })),
  });
});

// Remove a tx from mempool (e.g. after reorg or forced eviction)
app.delete("/mempool/:hash", (req: Request, res: Response) => {
  const { hash } = req.params;
  if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    res.status(400).json({ error: "invalid_hash" });
    return;
  }
  const existed = mempool.delete(hash);
  res.json({ ok: existed, hash });
});

// Force seal a block immediately (admin endpoint)
app.post("/admin/seal", async (_req: Request, res: Response) => {
  try {
    await sealBlock();
    res.json({ ok: true, currentBlock: currentBlock.toString(), mempoolSize: mempool.size });
  } catch (err) {
    res.status(500).json({ error: "seal_failed", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "ghost_sequencer_started",
    service: "ghost-sequencer",
    layer: LAYER,
    chainId: CHAIN_ID,
    port: PORT,
    blockTimeMs: BLOCK_TIME_MS,
    maxTxPerBlock: MAX_TX_PER_BLOCK,
    execUrl: EXEC_URL,
    settlementUrl: SETTLEMENT_URL,
  }));
});
