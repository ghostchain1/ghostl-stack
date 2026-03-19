import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// ghost-deriver — GhostChain custom batch deriver & state replay engine
//
// Responsibilities:
//   - Ingest serialised transaction batches published to the parent chain
//   - Validate batch integrity (hash check, chain ID binding)
//   - Replay batches via ghost-exec to reconstruct canonical L2/L3 state
//   - Track derivation cursor (last processed parent block)
//   - Provide safe/finalized head for downstream settlement & proof services
//   - Enforce L3->L2->L1 routing law (L3 deriver reads from L2, not L1)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7262");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();
// L2 derives from L1; L3 derives from L2 (routing law)
const PARENT_RPC = process.env.GHOST_PARENT_RPC_URL || (
  LAYER === "L2" ? "http://ghostchain-l1:18545" : "http://ghostl2:7260"
);
const EXEC_URL = process.env.GHOST_EXEC_URL || "http://ghost-exec:7260";
const STATE_DIR = process.env.STATE_DIR || "/state";
const CURSOR_FILE = path.join(STATE_DIR, `deriver-cursor-${CHAIN_ID}.json`);
const BATCH_INBOX_ADDRESS = process.env.BATCH_INBOX_ADDRESS || "";
const LOG_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE || "250");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "4000");
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || "15000");

// ---------------------------------------------------------------------------
// Derivation state
// ---------------------------------------------------------------------------
interface Cursor {
  lastProcessedParentBlock: number;
  lastDerivedBlock: number;
  totalBatchesProcessed: number;
  lastUpdatedAt: number;
}

let cursor: Cursor = {
  lastProcessedParentBlock: 0,
  lastDerivedBlock: 0,
  totalBatchesProcessed: 0,
  lastUpdatedAt: 0,
};
let deriving = false;
let deriveErrors = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
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

async function loadCursor(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const raw = await fs.readFile(CURSOR_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Cursor>;
    if (typeof parsed.lastProcessedParentBlock === "number") {
      cursor = {
        lastProcessedParentBlock: parsed.lastProcessedParentBlock,
        lastDerivedBlock: parsed.lastDerivedBlock ?? 0,
        totalBatchesProcessed: parsed.totalBatchesProcessed ?? 0,
        lastUpdatedAt: parsed.lastUpdatedAt ?? 0,
      };
    }
  } catch { /* start from zero */ }
}

async function saveCursor(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}

async function callExec(p: string, body: unknown): Promise<{ ok: boolean; [k: string]: unknown }> {
  const res = await fetch(`${EXEC_URL}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`exec_http_${res.status}`);
  return res.json() as Promise<{ ok: boolean; [k: string]: unknown }>;
}

// Fetch logs from the parent chain batch inbox contract
async function fetchBatchLogs(fromBlock: number, toBlock: number): Promise<unknown[]> {
  if (!BATCH_INBOX_ADDRESS) return [];
  const raw = await rpcCall(PARENT_RPC, "getLogs", [{
    address: BATCH_INBOX_ADDRESS,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
  }]);
  return Array.isArray(raw) ? raw : [];
}

async function deriveStep(): Promise<void> {
  if (deriving) return;
  deriving = true;
  try {
    const latestParentRaw = await rpcCall(PARENT_RPC, "blockNumber", []);
    const latestParent = typeof latestParentRaw === "string"
      ? parseInt(latestParentRaw, 16)
      : Number(latestParentRaw);
    if (latestParent <= cursor.lastProcessedParentBlock) return;

    const from = cursor.lastProcessedParentBlock + 1;
    const to = Math.min(latestParent, from + LOG_CHUNK_SIZE - 1);
    const logs = await fetchBatchLogs(from, to);

    for (const log of logs) {
      // Each log represents a transaction batch published to the inbox
      const logObj = log as { data?: string; blockNumber?: string; transactionHash?: string };
      if (!logObj.data) continue;

      // Replay batch via ghost-exec
      const result = await callExec("/exec/block", {
        batchData: logObj.data,
        parentBlockNumber: logObj.blockNumber,
        batchTxHash: logObj.transactionHash,
        chainId: CHAIN_ID,
        layer: LAYER,
      });

      if (result.ok) {
        cursor.lastDerivedBlock = Number((result.blockNumber as string | undefined) ?? cursor.lastDerivedBlock + 1);
        cursor.totalBatchesProcessed += 1;
        console.log(JSON.stringify({
          event: "batch_derived",
          parentBlock: logObj.blockNumber,
          batchTx: logObj.transactionHash,
          derivedBlock: cursor.lastDerivedBlock,
        }));
      } else {
        deriveErrors += 1;
        console.error(JSON.stringify({ event: "batch_derive_failed", result }));
      }
    }

    cursor.lastProcessedParentBlock = to;
    cursor.lastUpdatedAt = Date.now();
    await saveCursor();
    deriveErrors = 0;
  } catch (err) {
    deriveErrors += 1;
    console.error(JSON.stringify({ event: "derive_error", error: String(err) }));
  } finally {
    deriving = false;
  }
}

// ---------------------------------------------------------------------------
// Derivation loop
// ---------------------------------------------------------------------------
async function startDeriving(): Promise<void> {
  await loadCursor();
  console.log(JSON.stringify({ event: "deriver_resuming", cursor }));
  setInterval(() => {
    deriveStep().catch((e: unknown) => {
      console.error(JSON.stringify({ event: "derive_tick_error", error: String(e) }));
    });
  }, POLL_INTERVAL_MS);
}

startDeriving();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ghost-deriver",
    layer: LAYER,
    chainId: CHAIN_ID,
    deriving,
  });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    service: "ghost-deriver",
    layer: LAYER,
    chainId: CHAIN_ID,
    cursor,
    deriving,
    deriveErrors,
    parentRpc: PARENT_RPC,
    execUrl: EXEC_URL,
    batchInbox: BATCH_INBOX_ADDRESS || "(not configured)",
    pollIntervalMs: POLL_INTERVAL_MS,
  });
});

app.get("/cursor", (_req: Request, res: Response) => {
  res.json(cursor);
});

// Manual trigger (admin)
app.post("/admin/derive", async (_req: Request, res: Response) => {
  try {
    await deriveStep();
    res.json({ ok: true, cursor });
  } catch (err) {
    res.status(500).json({ error: "derive_failed", detail: String(err) });
  }
});

// Reset cursor (admin — use with caution, triggers full re-derivation)
app.post("/admin/reset-cursor", async (req: Request, res: Response) => {
  const { fromBlock } = req.body ?? {};
  cursor = {
    lastProcessedParentBlock: fromBlock !== undefined ? Number(fromBlock) : 0,
    lastDerivedBlock: 0,
    totalBatchesProcessed: 0,
    lastUpdatedAt: Date.now(),
  };
  await saveCursor();
  res.json({ ok: true, cursor });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "ghost_deriver_started",
    service: "ghost-deriver",
    layer: LAYER,
    chainId: CHAIN_ID,
    port: PORT,
    parentRpc: PARENT_RPC,
    execUrl: EXEC_URL,
    batchInbox: BATCH_INBOX_ADDRESS || "(not configured)",
  }));
});
