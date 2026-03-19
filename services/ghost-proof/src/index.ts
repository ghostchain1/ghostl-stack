import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// ghost-proof — GhostChain pluggable fraud-proof & dispute interface
//
// Responsibilities:
//   - Pluggable proof backend: fraud-proof (default), zk-SNARK (future)
//   - Monitor committed output roots from ghost-settlement
//   - Detect invalid state transitions by replaying disputed blocks via ghost-exec
//   - Submit dispute challenges to the parent chain rollup contract
//   - Track active and resolved disputes
//   - Expose /disputes/active endpoint (queried by ghost-settlement before finalizing)
//   - Zk-proof generation interface ready for future upgrade (stub)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7265");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();
const PROOF_MODE = (process.env.PROOF_MODE || "fraud") as "fraud" | "zk";
const PARENT_RPC = process.env.GHOST_PARENT_RPC_URL || (
  LAYER === "L2" ? "http://ghostchain-l1:18545" : "http://ghostl2:7260"
);
const ROLLUP_ADDRESS = process.env.ROLLUP_ADDRESS || (
  LAYER === "L2"
    ? "0xad32D5C2Da9f4159C4cc98686C005852b3905355"
    : "0x130A46b6E41DB6E1e18fb9c759F223c459190e90"
);
const EXEC_URL = process.env.GHOST_EXEC_URL || "http://ghost-exec:7260";
const SETTLEMENT_URL = process.env.GHOST_SETTLEMENT_URL || "http://ghost-settlement:7263";
const STATE_DIR = process.env.STATE_DIR || "/state";
const DISPUTES_FILE = path.join(STATE_DIR, `disputes-${CHAIN_ID}.json`);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "10000");
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || "15000");
const CHALLENGER_PRIVATE_KEY_FILE = process.env.CHALLENGER_PRIVATE_KEY_FILE || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DisputeStatus = "active" | "resolved_valid" | "resolved_invalid" | "withdrawn";

interface Dispute {
  id: string;
  blockNumber: number;
  claimedOutputRoot: string;
  computedOutputRoot: string | null;
  status: DisputeStatus;
  createdAt: number;
  resolvedAt?: number;
  challengeTxHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const disputes = new Map<string, Dispute>();
let monitoring = false;
let monitorErrors = 0;
let lastCheckedBlock = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function loadDisputes(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const raw = await fs.readFile(DISPUTES_FILE, "utf8");
    const arr = JSON.parse(raw) as Dispute[];
    for (const d of arr) disputes.set(d.id, d);
    // Restore lastCheckedBlock
    const maxBlock = Math.max(...arr.map((d) => d.blockNumber), 0);
    lastCheckedBlock = maxBlock;
  } catch { /* start fresh */ }
}

async function saveDisputes(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(DISPUTES_FILE, JSON.stringify(Array.from(disputes.values()), null, 2));
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

async function getCommitments(): Promise<Array<{ blockNumber: number; outputRoot: string }>> {
  try {
    const res = await fetch(`${SETTLEMENT_URL}/commitments`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { commitments?: Array<{ blockNumber: number; outputRoot: string }> };
    return body.commitments ?? [];
  } catch {
    return [];
  }
}

async function replayBlock(blockNumber: number): Promise<string | null> {
  try {
    const res = await fetch(`${EXEC_URL}/exec/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockNumber, replay: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok: boolean; result?: { outputRoot?: string } };
    return body.result?.outputRoot ?? null;
  } catch {
    return null;
  }
}

async function submitChallenge(blockNumber: number, claimedRoot: string, computedRoot: string): Promise<string | undefined> {
  const txPayload = {
    to: ROLLUP_ADDRESS,
    // In production: encoded challenge(blockNumber, claimedRoot, computedRoot, proof)
    data: `0xcafe${blockNumber.toString(16).padStart(64, "0")}${claimedRoot.replace("0x", "")}${computedRoot.replace("0x", "")}`,
  };
  try {
    const txHash = await rpcCall("sendTransaction", [txPayload]) as string;
    console.log(JSON.stringify({ event: "challenge_submitted", blockNumber, txHash }));
    return txHash;
  } catch (err) {
    console.error(JSON.stringify({ event: "challenge_submit_failed", blockNumber, error: String(err) }));
    return undefined;
  }
}

async function monitorStep(): Promise<void> {
  if (monitoring) return;
  monitoring = true;
  try {
    const commitments = await getCommitments();
    const newCommitments = commitments.filter((c) => c.blockNumber > lastCheckedBlock);

    for (const commitment of newCommitments) {
      const disputeId = `${CHAIN_ID}:${commitment.blockNumber}`;
      if (disputes.has(disputeId)) continue;

      // Replay the block to compute what output root should be
      const computedRoot = await replayBlock(commitment.blockNumber);
      if (!computedRoot) continue;

      if (computedRoot.toLowerCase() !== commitment.outputRoot.toLowerCase()) {
        // Output root mismatch — open a dispute
        const dispute: Dispute = {
          id: disputeId,
          blockNumber: commitment.blockNumber,
          claimedOutputRoot: commitment.outputRoot,
          computedOutputRoot: computedRoot,
          status: "active",
          createdAt: Date.now(),
        };

        console.warn(JSON.stringify({
          event: "dispute_opened",
          blockNumber: commitment.blockNumber,
          claimed: commitment.outputRoot,
          computed: computedRoot,
        }));

        if (PROOF_MODE === "fraud") {
          const txHash = await submitChallenge(commitment.blockNumber, commitment.outputRoot, computedRoot);
          dispute.challengeTxHash = txHash;
        } else {
          // ZK mode: generate proof (stub — wire up zk prover here)
          console.log(JSON.stringify({ event: "zk_proof_generation_stub", blockNumber: commitment.blockNumber }));
        }

        disputes.set(disputeId, dispute);
        await saveDisputes();
      } else {
        lastCheckedBlock = Math.max(lastCheckedBlock, commitment.blockNumber);
      }
    }

    monitorErrors = 0;
  } catch (err) {
    monitorErrors += 1;
    console.error(JSON.stringify({ event: "monitor_error", error: String(err) }));
  } finally {
    monitoring = false;
  }
}

async function startProof(): Promise<void> {
  await loadDisputes();
  console.log(JSON.stringify({
    event: "proof_service_resuming",
    activeDisputes: Array.from(disputes.values()).filter((d) => d.status === "active").length,
    proofMode: PROOF_MODE,
  }));
  setInterval(() => {
    monitorStep().catch((e: unknown) => {
      console.error(JSON.stringify({ event: "monitor_tick_error", error: String(e) }));
    });
  }, POLL_INTERVAL_MS);
}

startProof();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ghost-proof",
    layer: LAYER,
    chainId: CHAIN_ID,
    proofMode: PROOF_MODE,
  });
});

app.get("/status", (_req: Request, res: Response) => {
  const active = Array.from(disputes.values()).filter((d) => d.status === "active").length;
  res.json({
    service: "ghost-proof",
    layer: LAYER,
    chainId: CHAIN_ID,
    proofMode: PROOF_MODE,
    totalDisputes: disputes.size,
    activeDisputes: active,
    monitorErrors,
    rollupAddress: ROLLUP_ADDRESS,
    lastCheckedBlock,
  });
});

// Queried by ghost-settlement before finalizing a block
app.get("/disputes/active", (req: Request, res: Response) => {
  const blockNumber = req.query.blockNumber !== undefined ? Number(req.query.blockNumber) : undefined;
  if (blockNumber !== undefined) {
    const disputeId = `${CHAIN_ID}:${blockNumber}`;
    const dispute = disputes.get(disputeId);
    res.json({ hasActiveDispute: (dispute !== undefined && dispute.status === "active"), dispute: dispute ?? null });
    return;
  }
  const activeDisputes = Array.from(disputes.values()).filter((d) => d.status === "active");
  res.json({ hasActiveDispute: activeDisputes.length > 0, activeDisputes });
});

app.get("/disputes", (_req: Request, res: Response) => {
  res.json({ total: disputes.size, disputes: Array.from(disputes.values()) });
});

app.get("/disputes/:id", (req: Request, res: Response) => {
  const dispute = disputes.get(req.params.id);
  if (!dispute) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(dispute);
});

// Resolve a dispute (operator/governance action after on-chain resolution)
app.post("/disputes/:id/resolve", async (req: Request, res: Response) => {
  const dispute = disputes.get(req.params.id);
  if (!dispute) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const { valid } = req.body ?? {};
  dispute.status = valid ? "resolved_valid" : "resolved_invalid";
  dispute.resolvedAt = Date.now();
  await saveDisputes();
  console.log(JSON.stringify({ event: "dispute_resolved", id: dispute.id, status: dispute.status }));
  res.json({ ok: true, dispute });
});

// Manual dispute opening (rescue/testing)
app.post("/disputes", async (req: Request, res: Response) => {
  const { blockNumber, claimedOutputRoot } = req.body ?? {};
  if (!blockNumber || !claimedOutputRoot) {
    res.status(400).json({ error: "invalid_request", detail: "blockNumber and claimedOutputRoot required" });
    return;
  }
  const disputeId = `${CHAIN_ID}:${blockNumber}`;
  if (disputes.has(disputeId)) {
    res.status(409).json({ error: "dispute_already_exists", disputeId });
    return;
  }
  const computedRoot = await replayBlock(Number(blockNumber));
  const dispute: Dispute = {
    id: disputeId,
    blockNumber: Number(blockNumber),
    claimedOutputRoot,
    computedOutputRoot: computedRoot,
    status: "active",
    createdAt: Date.now(),
  };
  disputes.set(disputeId, dispute);
  await saveDisputes();
  res.status(201).json({ ok: true, dispute });
});

// ZK proof generation stub (future upgrade path)
app.post("/prove/zk", (_req: Request, res: Response) => {
  if (PROOF_MODE !== "zk") {
    res.status(400).json({ error: "zk_not_enabled", current: PROOF_MODE });
    return;
  }
  // Stub: in production wire up to ZK prover (e.g. SP1, Risc0, Groth16)
  res.json({ ok: false, message: "zk_proof_generation_not_yet_implemented" });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "ghost_proof_started",
    service: "ghost-proof",
    layer: LAYER,
    chainId: CHAIN_ID,
    port: PORT,
    proofMode: PROOF_MODE,
    rollupAddress: ROLLUP_ADDRESS,
    parentRpc: PARENT_RPC,
  }));
});
