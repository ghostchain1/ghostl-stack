import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// ghost-bridge — GhostChain canonical cross-domain message bridge
//
// Responsibilities:
//   - Monitor source chain for bridge deposit/withdrawal events
//   - Relay finalized messages to destination chain
//   - Enforce routing law:
//       L1 <-> L2 only at L2 bridge
//       L2 <-> L3 only at L3 bridge
//       L3 MUST NOT route directly to L1
//   - Queue and retry failed relays
//   - Track message nonces to prevent double-relay
//   - Canonical bridge addresses:
//       L2L3Bridge:   0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2
//       L1 Rollup:    0xad32D5C2Da9f4159C4cc98686C005852b3905355
//       L2 Rollup:    0x130A46b6E41DB6E1e18fb9c759F223c459190e90
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || "7264");
const CHAIN_ID = Number(process.env.CHAIN_ID || "901");
const LAYER = (process.env.GHOST_LAYER || "L2").toUpperCase();

// Bridge contract addresses (canonical)
const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || (
  LAYER === "L2"
    ? "0xad32D5C2Da9f4159C4cc98686C005852b3905355"  // L1->L2 rollup
    : "0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2"  // L2L3Bridge
);
const DEST_BRIDGE_ADDRESS = process.env.DEST_BRIDGE_ADDRESS || (
  LAYER === "L2"
    ? "0xad32D5C2Da9f4159C4cc98686C005852b3905355"
    : "0x130A46b6E41DB6E1e18fb9c759F223c459190e90"
);

const SOURCE_RPC = process.env.GHOST_SOURCE_RPC_URL || (
  LAYER === "L2" ? "http://ghostchain-l1:18545" : "http://ghostl2:7260"
);
const DEST_RPC = process.env.GHOST_DEST_RPC_URL || (
  LAYER === "L2" ? "http://ghostl2:8545" : "http://ghostl3:8545"
);
const SETTLEMENT_URL = process.env.GHOST_SETTLEMENT_URL || "http://ghost-settlement:7263";
const STATE_DIR = process.env.STATE_DIR || "/state";
const CURSOR_FILE = path.join(STATE_DIR, `bridge-cursor-${CHAIN_ID}.json`);
const LOG_CHUNK_SIZE = Number(process.env.LOG_CHUNK_SIZE || "250");
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || "5000");
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS || "15000");
const MAX_RETRY_QUEUE = Number(process.env.MAX_RETRY_QUEUE || "1000");
const RELAYER_PRIVATE_KEY_FILE = process.env.RELAYER_PRIVATE_KEY_FILE || "";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------
type MessageStatus = "pending" | "relayed" | "failed";

interface BridgeMessage {
  id: string;
  sourceChain: number;
  destChain: number;
  sender: string;
  target: string;
  data: string;
  value: string;
  nonce: number;
  sourceBlockNumber: number;
  sourceTxHash: string;
  status: MessageStatus;
  attempts: number;
  lastAttemptAt: number;
  relayedAt?: number;
  relayTxHash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const messages = new Map<string, BridgeMessage>();
const relayedNonces = new Set<string>();
let bridgeCursor = { lastProcessedSourceBlock: 0, totalRelayed: 0, totalFailed: 0, lastUpdatedAt: 0 };
let relaying = false;
let relayErrors = 0;

// ---------------------------------------------------------------------------
// Routing law check
// ---------------------------------------------------------------------------
function assertBridgeRoutingLaw(sourceChain: number, destChain: number): void {
  // L3 (903) MUST NOT send directly to L1 (14000101)
  if (sourceChain === 903 && destChain === 14000101) {
    throw new Error(
      `routing_violation: L3 chain ${sourceChain} attempted direct bridge to L1 chain ${destChain}. ` +
      "Messages from L3 must route through L2 first."
    );
  }
  // L1 (14000101) MUST NOT send directly to L3 (903) — must go through L2
  if (sourceChain === 14000101 && destChain === 903) {
    throw new Error(
      `routing_violation: L1 chain ${sourceChain} attempted direct bridge to L3 chain ${destChain}. ` +
      "Messages from L1 to L3 must transit L2."
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function loadCursor(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const raw = await fs.readFile(CURSOR_FILE, "utf8");
    const parsed = JSON.parse(raw) as typeof bridgeCursor;
    if (typeof parsed.lastProcessedSourceBlock === "number") {
      bridgeCursor = parsed;
    }
  } catch { /* start from zero */ }
}

async function saveCursor(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(CURSOR_FILE, JSON.stringify(bridgeCursor, null, 2));
}

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

async function getFinalizedHead(): Promise<number> {
  try {
    const res = await fetch(`${SETTLEMENT_URL}/finality`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return 0;
    const body = (await res.json()) as { finalizedHead?: number };
    return body.finalizedHead ?? 0;
  } catch {
    return 0;
  }
}

async function fetchBridgeLogs(fromBlock: number, toBlock: number): Promise<unknown[]> {
  const raw = await rpcCall(SOURCE_RPC, "getLogs", [{
    address: BRIDGE_ADDRESS,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
  }]);
  return Array.isArray(raw) ? raw : [];
}

function parseMessageFromLog(log: Record<string, unknown>): BridgeMessage | null {
  // In production: decode event topics/data for MessagePassed(nonce, sender, target, value, data, ...)
  const hash = log.transactionHash as string | undefined;
  const blockNumber = typeof log.blockNumber === "string"
    ? parseInt(log.blockNumber, 16)
    : Number(log.blockNumber ?? 0);
  if (!hash || !blockNumber) return null;

  const nonce = crypto.randomInt(0, 2 ** 31); // placeholder — real: decode from log data
  const nonceKey = `${CHAIN_ID}:${nonce}`;
  if (relayedNonces.has(nonceKey)) return null;

  return {
    id: hash,
    sourceChain: LAYER === "L2" ? 14000101 : 901,
    destChain: CHAIN_ID,
    sender: (log.address as string | undefined) ?? "0x0000000000000000000000000000000000000000",
    target: (log.topics as string[] | undefined)?.[1]?.slice(-40) ?? "0x0000000000000000000000000000000000000000",
    data: (log.data as string | undefined) ?? "0x",
    value: "0x0",
    nonce,
    sourceBlockNumber: blockNumber,
    sourceTxHash: hash,
    status: "pending",
    attempts: 0,
    lastAttemptAt: 0,
  };
}

async function relayMessage(msg: BridgeMessage): Promise<void> {
  // Routing law check before relaying
  assertBridgeRoutingLaw(msg.sourceChain, msg.destChain);

  msg.attempts += 1;
  msg.lastAttemptAt = Date.now();
  try {
    const txPayload = {
      to: DEST_BRIDGE_ADDRESS,
      data: msg.data,
      value: msg.value,
      // relayMessage(nonce, sender, target, value, data)
    };
    const txHash = await rpcCall(DEST_RPC, "sendTransaction", [txPayload]) as string;
    msg.status = "relayed";
    msg.relayedAt = Date.now();
    msg.relayTxHash = txHash;
    relayedNonces.add(`${CHAIN_ID}:${msg.nonce}`);
    bridgeCursor.totalRelayed += 1;
    console.log(JSON.stringify({
      event: "message_relayed",
      id: msg.id,
      nonce: msg.nonce,
      destTxHash: txHash,
    }));
    relayErrors = 0;
  } catch (err) {
    msg.status = "failed";
    msg.error = String(err);
    bridgeCursor.totalFailed += 1;
    relayErrors += 1;
    console.error(JSON.stringify({ event: "relay_failed", id: msg.id, error: String(err) }));
  }
}

async function bridgeStep(): Promise<void> {
  if (relaying) return;
  relaying = true;
  try {
    const finalizedHead = await getFinalizedHead();
    if (finalizedHead <= bridgeCursor.lastProcessedSourceBlock) return;

    const from = bridgeCursor.lastProcessedSourceBlock + 1;
    const to = Math.min(finalizedHead, from + LOG_CHUNK_SIZE - 1);
    const logs = await fetchBridgeLogs(from, to);

    for (const rawLog of logs) {
      const log = rawLog as Record<string, unknown>;
      const msg = parseMessageFromLog(log);
      if (!msg) continue;
      messages.set(msg.id, msg);
      try {
        await relayMessage(msg);
      } catch (e: unknown) {
        console.error(JSON.stringify({ event: "relay_routing_error", id: msg.id, error: String(e) }));
        msg.status = "failed";
        msg.error = String(e);
        bridgeCursor.totalFailed += 1;
      }
    }

    // Retry pending/failed with remaining attempts
    const retryQueue = Array.from(messages.values())
      .filter((m) => m.status === "failed" && m.attempts < 3)
      .slice(0, MAX_RETRY_QUEUE);
    for (const msg of retryQueue) {
      try {
        await relayMessage(msg);
      } catch { /* will retry next tick */ }
    }

    bridgeCursor.lastProcessedSourceBlock = to;
    bridgeCursor.lastUpdatedAt = Date.now();
    await saveCursor();
  } catch (err) {
    relayErrors += 1;
    console.error(JSON.stringify({ event: "bridge_step_error", error: String(err) }));
  } finally {
    relaying = false;
  }
}

async function startBridge(): Promise<void> {
  await loadCursor();
  console.log(JSON.stringify({ event: "bridge_resuming", cursor: bridgeCursor }));
  setInterval(() => {
    bridgeStep().catch((e: unknown) => {
      console.error(JSON.stringify({ event: "bridge_tick_error", error: String(e) }));
    });
  }, POLL_INTERVAL_MS);
}

startBridge();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ghost-bridge",
    layer: LAYER,
    chainId: CHAIN_ID,
    relaying,
  });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    service: "ghost-bridge",
    layer: LAYER,
    chainId: CHAIN_ID,
    cursor: bridgeCursor,
    messages: messages.size,
    relayErrors,
    bridgeAddress: BRIDGE_ADDRESS,
    destBridgeAddress: DEST_BRIDGE_ADDRESS,
    sourceRpc: SOURCE_RPC,
    destRpc: DEST_RPC,
  });
});

app.get("/messages", (req: Request, res: Response) => {
  const statusFilter = req.query.status as string | undefined;
  const items = Array.from(messages.values())
    .filter((m) => !statusFilter || m.status === statusFilter)
    .slice(0, 100);
  res.json({ total: messages.size, messages: items });
});

app.get("/messages/:id", (req: Request, res: Response) => {
  const msg = messages.get(req.params.id);
  if (!msg) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(msg);
});

// Manual relay submission (for testing/rescue)
app.post("/relay", async (req: Request, res: Response) => {
  const { sourceChain, destChain, sender, target, data, value, nonce, sourceTxHash } = req.body ?? {};
  if (!sender || !target || !data || !sourceTxHash) {
    res.status(400).json({ error: "invalid_request", detail: "sender, target, data, sourceTxHash required" });
    return;
  }
  const sc = Number(sourceChain ?? (LAYER === "L2" ? 14000101 : 901));
  const dc = Number(destChain ?? CHAIN_ID);
  try {
    assertBridgeRoutingLaw(sc, dc);
  } catch (routingErr) {
    res.status(403).json({ error: "routing_violation", detail: String(routingErr) });
    return;
  }
  const msg: BridgeMessage = {
    id: sourceTxHash,
    sourceChain: sc,
    destChain: dc,
    sender,
    target,
    data,
    value: value ?? "0x0",
    nonce: nonce ?? crypto.randomInt(0, 2 ** 31),
    sourceBlockNumber: 0,
    sourceTxHash,
    status: "pending",
    attempts: 0,
    lastAttemptAt: 0,
  };
  messages.set(msg.id, msg);
  try {
    await relayMessage(msg);
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: "relay_failed", detail: String(err), message: msg });
  }
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "ghost_bridge_started",
    service: "ghost-bridge",
    layer: LAYER,
    chainId: CHAIN_ID,
    port: PORT,
    bridgeAddress: BRIDGE_ADDRESS,
    sourceRpc: SOURCE_RPC,
    destRpc: DEST_RPC,
  }));
});
