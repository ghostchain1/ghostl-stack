import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// ghost-settlement — GhostChain commitment posting & finality tracking
//
// Responsibilities:
//   - Receive sealed blocks from ghost-sequencer
//   - Compute output roots and post commitments to the parent chain rollup contract
//   - Track finality cursor (safe / finalized heads)
//   - Query ghost-proof to confirm no active disputes before promoting finalized head
//   - Enforce challenge period before marking output as finalized
//   - L2 settles to GhostChain L1; L3 settles to GhostL2 (routing law)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7263");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();
// L2 settles to L1; L3 settles to L2
const PARENT_RPC = process.env.GHOST_PARENT_RPC_URL || (
  LAYER === "L2" ? "http://ghostchain-l1:18545" : "http://ghostl2:7260"
);
const ROLLUP_ADDRESS = process.env.ROLLUP_ADDRESS || (
  LAYER === "L2"
    ? "0xad32D5C2Da9f4159C4cc98686C005852b3905355"
    : "0x130A46b6E41DB6E1e18fb9c759F223c459190e90"
);
const FINALITY_ORACLE = process.env.FINALITY_ORACLE_ADDRESS || (
  LAYER === "L2"
    ? "0x7B3Be2dDDdDf9A0a3fE1DC57B98980F662C3a422"
    : "0x87F850cbC2cFfac086F20d0d7307E12d06fA2127"
);
const PROOF_URL = process.env.GHOST_PROOF_URL || "http://ghost-proof:7265";
const STATE_DIR = process.env.STATE_DIR || "/state";
const CURSOR_FILE = path.join(STATE_DIR, `settlement-cursor-${CHAIN_ID}.json`);
const CHALLENGE_PERIOD_SECONDS = Number(process.env.CHALLENGE_PERIOD_SECONDS || "300");
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS || "12");
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || "15000");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "6000");
const PROPOSER_PRIVATE_KEY_FILE = process.env.PROPOSER_PRIVATE_KEY_FILE || "";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface PendingCommitment {
  blockNumber: number;
  outputRoot: string;
  txCount: number;
  submittedAt: number;
  parentTxHash?: string;
  finalizableAt: number;
  finalized: boolean;
}

interface SettlementCursor {
  lastCommittedBlock: number;
  lastFinalizedBlock: number;
  safeHead: number;
  finalizedHead: number;
  totalCommitments: number;
  lastUpdatedAt: number;
}

const pendingCommitments = new Map<number, PendingCommitment>();
let cursor: SettlementCursor = {
  lastCommittedBlock: 0,
  lastFinalizedBlock: 0,
  safeHead: 0,
  finalizedHead: 0,
  totalCommitments: 0,
  lastUpdatedAt: 0,
};
let posting = false;
let postErrors = 0;

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

async function loadCursor(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const raw = await fs.readFile(CURSOR_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<SettlementCursor>;
    if (typeof parsed.lastCommittedBlock === "number") {
      cursor = { ...cursor, ...parsed };
    }
  } catch { /* start from zero */ }
}

async function saveCursor(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(PARENT_RPC, {
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

async function hasActiveDispute(blockNumber: number): Promise<boolean> {
  try {
    const res = await fetch(`${PROOF_URL}/disputes/active?blockNumber=${blockNumber}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { hasActiveDispute?: boolean };
    return body.hasActiveDispute === true;
  } catch {
    // If proof service is unreachable, be conservative: treat as active dispute
    return true;
  }
}

// Compute a simple output root (keccak256 of block metadata) — real implementation
// would compute this from state trie, receipts trie, etc.
function computeOutputRoot(blockNumber: number, blockHash: string, stateRoot: string): string {
  // Placeholder: in production this is H(version ++ stateRoot ++ withdrawalStorageRoot ++ blockHash)
  const components = [blockNumber.toString(16).padStart(64, "0"), blockHash.replace("0x", ""), stateRoot.replace("0x", "")];
  return "0x" + components.join("").substring(0, 64);
}

async function postCommitment(blockNumber: number, blockHash: string, stateRoot: string, txCount: number): Promise<void> {
  const outputRoot = computeOutputRoot(blockNumber, blockHash, stateRoot);
  const finalizableAt = Math.floor(Date.now() / 1000) + CHALLENGE_PERIOD_SECONDS;

  // Post to parent chain rollup contract
  const txPayload = {
    to: ROLLUP_ADDRESS,
    data: `0x9aaab648${blockNumber.toString(16).padStart(64, "0")}${outputRoot.replace("0x", "")}`,
    // In production: encoded proposeL2Output(outputRoot, l2BlockNumber, l1BlockHash, l1BlockNumber)
  };

  let parentTxHash: string | undefined;
  try {
    const result = await rpcCall("sendTransaction", [txPayload]) as string | undefined;
    parentTxHash = result ?? undefined;
  } catch (err) {
    console.error(JSON.stringify({ event: "commitment_post_failed", blockNumber, error: String(err) }));
    postErrors += 1;
    return;
  }

  pendingCommitments.set(blockNumber, {
    blockNumber,
    outputRoot,
    txCount,
    submittedAt: Date.now(),
    parentTxHash,
    finalizableAt,
    finalized: false,
  });

  cursor.lastCommittedBlock = Math.max(cursor.lastCommittedBlock, blockNumber);
  cursor.safeHead = cursor.lastCommittedBlock;
  cursor.totalCommitments += 1;
  cursor.lastUpdatedAt = Date.now();
  await saveCursor();

  console.log(JSON.stringify({
    event: "commitment_posted",
    blockNumber,
    outputRoot,
    parentTxHash,
    finalizableAt,
  }));
  postErrors = 0;
}

// Promote finalized head for commitments past challenge period with no active dispute
async function promoteFinalized(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const [blockNumber, commitment] of pendingCommitments) {
    if (commitment.finalized) continue;
    if (now < commitment.finalizableAt) continue;
    const disputed = await hasActiveDispute(blockNumber);
    if (disputed) {
      console.warn(JSON.stringify({ event: "finalization_blocked_by_dispute", blockNumber }));
      continue;
    }
    commitment.finalized = true;
    cursor.lastFinalizedBlock = Math.max(cursor.lastFinalizedBlock, blockNumber);
    cursor.finalizedHead = cursor.lastFinalizedBlock;
    cursor.lastUpdatedAt = Date.now();
    await saveCursor();
    console.log(JSON.stringify({ event: "block_finalized", blockNumber, outputRoot: commitment.outputRoot }));
  }
}

// ---------------------------------------------------------------------------
// Finality promotion loop
// ---------------------------------------------------------------------------
async function startSettlement(): Promise<void> {
  await loadCursor();
  console.log(JSON.stringify({ event: "settlement_resuming", cursor }));
  setInterval(async () => {
    try {
      await promoteFinalized();
    } catch (e: unknown) {
      console.error(JSON.stringify({ event: "finality_promotion_error", error: String(e) }));
    }
  }, POLL_INTERVAL_MS);
}

startSettlement();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ghost-settlement",
    layer: LAYER,
    chainId: CHAIN_ID,
  });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    service: "ghost-settlement",
    layer: LAYER,
    chainId: CHAIN_ID,
    cursor,
    pendingCommitments: pendingCommitments.size,
    postErrors,
    rollupAddress: ROLLUP_ADDRESS,
    finalityOracle: FINALITY_ORACLE,
    challengePeriodSeconds: CHALLENGE_PERIOD_SECONDS,
    parentRpc: PARENT_RPC,
  });
});

app.get("/finality", (_req: Request, res: Response) => {
  res.json({
    safeHead: cursor.safeHead,
    finalizedHead: cursor.finalizedHead,
    lastCommittedBlock: cursor.lastCommittedBlock,
  });
});

// Called by ghost-sequencer after sealing a block
app.post("/batch", async (req: Request, res: Response) => {
  const { blockNumber, txCount, execResult } = req.body ?? {};
  if (blockNumber === undefined || txCount === undefined) {
    res.status(400).json({ error: "invalid_request", detail: "blockNumber and txCount required" });
    return;
  }
  const bn = Number(blockNumber);
  if (bn <= cursor.lastCommittedBlock) {
    res.status(409).json({ error: "already_committed", blockNumber: bn });
    return;
  }
  try {
    await postCommitment(
      bn,
      (execResult as { blockHash?: string } | undefined)?.blockHash ?? "0x" + "0".repeat(64),
      (execResult as { stateRoot?: string } | undefined)?.stateRoot ?? "0x" + "0".repeat(64),
      Number(txCount),
    );
    res.json({ ok: true, cursor });
  } catch (err) {
    res.status(500).json({ error: "commitment_failed", detail: String(err) });
  }
});

app.get("/commitments", (_req: Request, res: Response) => {
  const items = Array.from(pendingCommitments.values());
  res.json({ total: items.length, commitments: items });
});

app.get("/commitments/:blockNumber", (req: Request, res: Response) => {
  const bn = Number(req.params.blockNumber);
  const c = pendingCommitments.get(bn);
  if (!c) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(c);
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "ghost_settlement_started",
    service: "ghost-settlement",
    layer: LAYER,
    chainId: CHAIN_ID,
    port: PORT,
    rollupAddress: ROLLUP_ADDRESS,
    finalityOracle: FINALITY_ORACLE,
    challengePeriodSeconds: CHALLENGE_PERIOD_SECONDS,
    parentRpc: PARENT_RPC,
  }));
});
