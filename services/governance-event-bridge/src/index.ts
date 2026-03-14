/**
 * index.ts
 *
 * Governance Event Bridge — entry point.
 *
 * Polls GhostChain L1 for governance contract events and forwards each
 * one to ghostbrain-core /signals so GhostBrain can reason about them.
 *
 * Also exposes a minimal HTTP server on PORT (default 9200) for health
 * checks and operational inspection.
 */

import express, { type Request, type Response } from "express";
import pino from "pino";
import { config } from "./config.js";
import { publishGovernanceEvent, type GovernanceEvent } from "./brain.js";

const SERVICE = "governance-event-bridge";

const log = pino({
  name: SERVICE,
  level: config.logLevel,
  transport: process.env["NODE_ENV"] !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

// ── Known governance event signatures (4-byte selectors → friendly name) ─────
// In a real deployment these come from the ABI; we keep a minimal set here
// so the bridge works without a full ABI parser dependency.
const GOVERNANCE_EVENTS: Record<string, string> = {
  ProposalCreated:   "ProposalCreated",
  ProposalQueued:    "ProposalQueued",
  ProposalExecuted:  "ProposalExecuted",
  ProposalCanceled:  "ProposalCanceled",
  VoteCast:          "VoteCast",
  VoteCastWithParams:"VoteCastWithParams",
  QuorumNumeratorUpdated: "QuorumNumeratorUpdated",
  TimelockChange:    "TimelockChange",
};

// Track last seen block so duplicate events are not forwarded
let lastSeenBlock = config.startBlock;
let stats = { eventsPublished: 0, pollCycles: 0, errors: 0 };

// ── Simple RPC helper (no ethers/web3 dependency) ────────────────────────────

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

async function getBlockNumber(): Promise<number> {
  const hex = (await rpcCall("eth_blockNumber", [])) as string;
  return parseInt(hex, 16);
}

interface RpcLog {
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

async function getLogs(fromBlock: number, toBlock: number): Promise<RpcLog[]> {
  if (config.governanceContractAddress === "0x0000000000000000000000000000000000000000") {
    return []; // no contract configured yet
  }
  const result = await rpcCall("eth_getLogs", [{
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock:   `0x${toBlock.toString(16)}`,
    address:   config.governanceContractAddress,
  }]);
  return result as RpcLog[];
}

// topic0 is the keccak256 of the event signature — we map the last known
// human-readable name by matching the topic against well-known selectors.
// For simplicity we match by event name stored in topics[0] suffix pattern.
function resolveEventName(topics: string[]): string {
  const topic0 = topics[0] ?? "";
  // Fallback: use a shortened topic hex as the event name
  for (const name of Object.values(GOVERNANCE_EVENTS)) {
    // Topics are keccak256 hashes; real resolution needs ABI.
    // Here we just store all logs as "GovernanceLog" until ABI is wired in.
    void name;
  }
  return `GovernanceLog_${topic0.slice(0, 10)}`;
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  stats.pollCycles++;
  try {
    const currentBlock = await getBlockNumber();
    const fromBlock = lastSeenBlock > 0 ? lastSeenBlock + 1 : currentBlock;
    if (fromBlock > currentBlock) return; // nothing new

    const logs = await getLogs(fromBlock, currentBlock);
    log.debug({ fromBlock, toBlock: currentBlock, logCount: logs.length }, "poll cycle");

    for (const rpcLog of logs) {
      const eventName = resolveEventName(rpcLog.topics);
      const event: GovernanceEvent = {
        eventName,
        blockNumber: parseInt(rpcLog.blockNumber, 16),
        transactionHash: rpcLog.transactionHash,
        args: { data: rpcLog.data, topics: rpcLog.topics },
      };
      await publishGovernanceEvent(event);
      stats.eventsPublished++;
    }

    lastSeenBlock = currentBlock;
  } catch (err) {
    stats.errors++;
    log.error({ err }, "poll cycle error");
  }
}

// ── HTTP health & status server ───────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: SERVICE, port: config.port, uptime: process.uptime() });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: SERVICE,
    lastSeenBlock,
    rpcUrl: config.rpcUrl,
    governanceContract: config.governanceContractAddress,
    ghostbrainCoreUrl: config.ghostbrainCoreUrl,
    stats,
  });
});

app.listen(config.port, () => {
  log.info(`${SERVICE} health server on :${config.port}`);
});

// ── Start polling ─────────────────────────────────────────────────────────────

log.info(
  {
    rpcUrl: config.rpcUrl,
    contract: config.governanceContractAddress,
    ghostbrainCore: config.ghostbrainCoreUrl,
    pollIntervalMs: config.pollIntervalMs,
  },
  "governance-event-bridge starting",
);

void pollOnce(); // initial poll immediately
const interval = setInterval(() => void pollOnce(), config.pollIntervalMs);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  log.info({ signal }, "shutting down");
  clearInterval(interval);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
