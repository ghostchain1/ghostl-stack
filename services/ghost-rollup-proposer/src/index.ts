import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7272");
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || "1500");
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || "2"));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || "30000"));
const registryCache: { data: any; expiresAt: number } = { data: null, expiresAt: 0 };
const RPC_SETTLEMENT = process.env.RPC_SETTLEMENT || "";
const RPC_CHILD = process.env.RPC_CHILD || "";
const ROLLUP = process.env.ROLLUP_ADDRESS!;
const PROPOSER_PRIVATE_KEY = process.env.PROPOSER_PRIVATE_KEY || "";
const STATE_DIR = process.env.STATE_DIR || "/state";
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "12");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;
const batchSizeRaw = Number(process.env.BATCH_SIZE || "20");
const BATCH_SIZE = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.floor(batchSizeRaw) : 20;
const challengePeriodRaw = Number(process.env.CHALLENGE_PERIOD_SECONDS || "30");
const CHALLENGE_PERIOD_SECONDS =
  Number.isFinite(challengePeriodRaw) && challengePeriodRaw >= 0 ? Math.floor(challengePeriodRaw) : 30;
const EXPECTED_SETTLEMENT_CHAIN_ID = parseChainIdEnv(process.env.EXPECTED_SETTLEMENT_CHAIN_ID, "EXPECTED_SETTLEMENT_CHAIN_ID");
const EXPECTED_CHILD_CHAIN_ID = parseChainIdEnv(process.env.EXPECTED_CHILD_CHAIN_ID, "EXPECTED_CHILD_CHAIN_ID");
const EXPECTED_ROLLUP_CODE_HASH = parseCodeHashEnv(process.env.ROLLUP_CODE_HASH);
const childHeadTagRaw = (process.env.CHILD_HEAD_TAG || process.env.ROLLUP_CHILD_HEAD_TAG || "safe").toLowerCase();
const CHILD_HEAD_TAG: "safe" | "finalized" | "latest" =
  childHeadTagRaw === "finalized" ? "finalized" : childHeadTagRaw === "latest" ? "latest" : "safe";

function clampInt(raw: string | undefined, fallback: number, min: number, max: number, label: string): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.warn(`[Startup] Ignoring invalid ${label}=${raw}`);
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

const RPC_TIMEOUT_MS = clampInt(process.env.RPC_TIMEOUT_MS, 15_000, 1_000, 300_000, "RPC_TIMEOUT_MS");
const TX_WAIT_TIMEOUT_MS = clampInt(process.env.TX_WAIT_TIMEOUT_MS, 60_000, 5_000, 600_000, "TX_WAIT_TIMEOUT_MS");
const WATCHDOG_STALL_MS = clampInt(process.env.WATCHDOG_STALL_MS, 300_000, 10_000, 3_600_000, "WATCHDOG_STALL_MS");
const CATCHUP_LAG_THRESHOLD = clampInt(process.env.CATCHUP_LAG_THRESHOLD, 5_000, 0, 10_000_000, "CATCHUP_LAG_THRESHOLD");
const CATCHUP_BATCH_SIZE = clampInt(
  process.env.CATCHUP_BATCH_SIZE,
  Math.min(200, BATCH_SIZE * 10),
  BATCH_SIZE,
  50_000,
  "CATCHUP_BATCH_SIZE"
);
const BLOCK_FETCH_PARALLELISM = clampInt(process.env.BLOCK_FETCH_PARALLELISM, 20, 1, 200, "BLOCK_FETCH_PARALLELISM");

const fetchRegistry = async () => {
  const now = Date.now();
  if (registryCache.data && registryCache.expiresAt > now) return registryCache.data;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= registryRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), registryTimeoutMs);
    try {
      const res = await fetch(registryUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`registry_http_${res.status}`);
      const body = await res.json();
      if (!body || !Array.isArray(body.chains)) throw new Error("registry_invalid");
      registryCache.data = body;
      registryCache.expiresAt = now + registryCacheMs;
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < registryRetries) {
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr || new Error("registry_unavailable");
};

const collectAllowed = (registry: any) => {
  const urls = new Set<string>();
  registry.chains.forEach((chain: any) => {
    if (typeof chain.rpc === "string" && chain.rpc) urls.add(chain.rpc);
    if (typeof chain.ws === "string" && chain.ws) urls.add(chain.ws);
    if (Array.isArray(chain.rpcUrls)) chain.rpcUrls.forEach((url: string) => urls.add(url));
    if (Array.isArray(chain.wsUrls)) chain.wsUrls.forEach((url: string) => urls.add(url));
    if (Array.isArray(chain.endpoints)) chain.endpoints.forEach((endpoint: any) => endpoint.url && urls.add(endpoint.url));
  });
  return urls;
};

const resolveRpcOverrides = async () => {
  if (!RPC_SETTLEMENT || !RPC_CHILD) {
    throw new Error("missing_rpc_overrides");
  }
  const registry = await fetchRegistry();
  const allowed = collectAllowed(registry);
  if (!allowed.has(RPC_SETTLEMENT)) throw new Error("rpc_settlement_not_in_registry");
  if (!allowed.has(RPC_CHILD)) throw new Error("rpc_child_not_in_registry");
  return { settlement: RPC_SETTLEMENT, child: RPC_CHILD };
};

const { settlement: RPC_SETTLEMENT_RESOLVED, child: RPC_CHILD_RESOLVED } = await resolveRpcOverrides();

if (!RPC_SETTLEMENT_RESOLVED || !RPC_CHILD_RESOLVED || !ROLLUP) {
  console.error("Missing env: RPC_SETTLEMENT, RPC_CHILD, ROLLUP_ADDRESS");
  process.exit(1);
}
const observeOnly = !PROPOSER_PRIVATE_KEY;

function makeProvider(url: string): ethers.JsonRpcProvider {
  const req = new ethers.FetchRequest(url);
  req.timeout = RPC_TIMEOUT_MS;
  const p = new ethers.JsonRpcProvider(req, undefined, { polling: true });
  p.pollingInterval = 1000;
  return p;
}

const settlement = makeProvider(RPC_SETTLEMENT_RESOLVED);
const child = makeProvider(RPC_CHILD_RESOLVED);

const wallet = observeOnly ? null : new ethers.Wallet(PROPOSER_PRIVATE_KEY, settlement);
const walletAddress = wallet?.address || "";

const rollupAbi = [
  "function proposeBatch(uint256 startBlock, uint256 endBlock, bytes32 root) external returns (uint256)",
  "function finalizeBatch(uint256 batchId) external",
  "function batchesLength() view returns (uint256)",
  "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)",
  "function challengePeriodSeconds() view returns (uint256)",
  "event BatchProposed(uint256 indexed batchId, uint256 indexed startBlock, uint256 indexed endBlock, bytes32 root)",
  "event BatchFinalized(uint256 indexed batchId)"
];
const rollup = new ethers.Contract(ROLLUP, rollupAbi, wallet ?? settlement);

type Cursor = { nextChildBlock: number | null };
const cursorPath = path.join(STATE_DIR, "cursor.json");

function parseChainIdEnv(raw: string | undefined, label: string): bigint | null {
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    if (n <= 0n) throw new Error("chainId must be positive");
    return n;
  } catch {
    console.warn(`[Startup] Ignoring invalid ${label}=${raw}`);
    return null;
  }
}

function parseCodeHashEnv(raw: string | undefined): string | null {
  if (!raw) return null;
  if (ethers.isHexString(raw, 32)) return ethers.hexlify(raw);
  console.warn(`[Startup] Ignoring invalid ROLLUP_CODE_HASH=${raw}`);
  return null;
}

async function loadCursor(): Promise<Cursor> {
  try {
    const raw = await fs.readFile(cursorPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Cursor>;
    const n = parsed.nextChildBlock;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return { nextChildBlock: Math.floor(n) };
  } catch {
    // ignore
  }
  return { nextChildBlock: null };
}

async function saveCursor(c: Cursor) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${cursorPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(c, null, 2) + "\n", "utf8");
  await fs.rename(tmp, cursorPath);
}

function hashLeaf(blockNumber: number, blockHash: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(["uint256", "bytes32"], [BigInt(blockNumber), blockHash as `0x${string}`])
  );
}

function hashPair(a: string, b: string): string {
  return ethers.keccak256(ethers.concat([a as `0x${string}`, b as `0x${string}`]));
}

function merkleRoot(leaves: Array<string>): string {
  if (leaves.length === 0) return ethers.ZeroHash;
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Array<string> = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0]!;
}

async function fetchChildLeaves(start: number, end: number): Promise<Array<string>> {
  const count = Math.max(0, end - start + 1);
  if (count === 0) return [];

  const hashes = new Array<string>(count);
  let next = start;
  const workers = Array.from({ length: Math.min(BLOCK_FETCH_PARALLELISM, count) }, async () => {
    while (true) {
      const n = next;
      if (n > end) return;
      next += 1;

      const b = await child.getBlock(n);
      if (!b?.hash) throw new Error(`missing block hash for child block ${n}`);
      hashes[n - start] = b.hash;
    }
  });
  await Promise.all(workers);

  return hashes.map((h, i) => hashLeaf(start + i, h));
}

async function getStableChildHeadNumber(): Promise<number> {
  if (CHILD_HEAD_TAG !== "latest") {
    try {
      const blk = await child.getBlock(CHILD_HEAD_TAG);
      const n = blk?.number;
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
    } catch (e) {
      console.warn(`[Proposer] Failed to fetch child head tag=${CHILD_HEAD_TAG}; falling back to latest-confirmations`, scrubError(e));
    }
  }
  const latest = await child.getBlockNumber();
  return Math.max(0, latest - CONFIRMATIONS);
}

const metrics = {
  startedAt: Date.now(),
  observeOnly,
  lastTickStartedAt: 0,
  lastTickFinishedAt: 0,
  lastTickError: null as null | string,
  lastProposedAt: 0,
  lastFinalizedAt: 0,
  proposals: 0,
  finalizations: 0,
  errors: 0,
  lastProposed: null as any,
  lastFinalized: null as any
};

async function getNonceState(): Promise<{ latest: number; pending: number }> {
  if (observeOnly || !walletAddress) return { latest: 0, pending: 0 };
  const [latest, pending] = await Promise.all([
    settlement.getTransactionCount(walletAddress, "latest"),
    settlement.getTransactionCount(walletAddress, "pending"),
  ]);
  return { latest, pending };
}

async function proposeNextBatch() {
  if (observeOnly) return;
  const { latest, pending } = await getNonceState();
  if (pending > latest) {
    // Do not enqueue future nonces; wait for the in-flight tx to be mined or dropped.
    console.log(`[Proposer] Pending tx detected (latestNonce=${latest} pendingNonce=${pending}); skipping propose`);
    return;
  }
  const scanTo = await getStableChildHeadNumber();

  // Keep our cursor aligned with on-chain rollup state.
  // This avoids getting wedged on restarts (e.g., when rollup already has batches but our cursor is missing/stale).
  const rollupLen = Number(await rollup.batchesLength());
  if (rollupLen > 0) {
    const last = await rollup.batches(rollupLen - 1);
    if (Boolean(last.invalidated)) {
      throw new Error(`latest rollup batch invalidated (batchId=${rollupLen - 1}); cannot propose further batches`);
    }
    state.nextChildBlock = Number(last.endBlock) + 1;
  } else if (state.nextChildBlock == null) {
    // Start slightly behind latest to avoid empty early history.
    state.nextChildBlock = Math.max(0, scanTo - 50);
  }
  if (state.nextChildBlock > scanTo) return;

  const start = state.nextChildBlock;
  const remaining = Math.max(0, scanTo - start + 1);
  const effectiveBatchSize = remaining > CATCHUP_LAG_THRESHOLD ? CATCHUP_BATCH_SIZE : BATCH_SIZE;
  const end = Math.min(scanTo, start + effectiveBatchSize - 1);

  const leaves = await fetchChildLeaves(start, end);
  const root = merkleRoot(leaves);

  const tx = await rollup.proposeBatch(start, end, root, { nonce: latest });
  console.log(`[Proposer] Propose sent tx=${tx.hash} nonce=${tx.nonce} start=${start} end=${end}`);
  const rcpt = await tx.wait(1, TX_WAIT_TIMEOUT_MS);
  if (!rcpt) throw new Error(`tx not mined within timeout (tx=${tx.hash})`);

  const batchId = (() => {
    for (const l of rcpt!.logs) {
      try {
        const parsed = rollup.interface.parseLog(l);
        if (parsed?.name === "BatchProposed") return Number(parsed.args[0]);
      } catch {
        // ignore
      }
    }
    return null;
  })();

  metrics.proposals += 1;
  metrics.lastProposedAt = Date.now();
  metrics.lastProposed = { batchId, start, end, root, tx: tx.hash };
  state.nextChildBlock = end + 1;
  await saveCursor(state);
}

async function finalizeSome() {
  if (observeOnly) return;
  const { latest, pending } = await getNonceState();
  if (pending > latest) {
    console.log(`[Proposer] Pending tx detected (latestNonce=${latest} pendingNonce=${pending}); skipping finalize`);
    return;
  }
  const len = Number(await rollup.batchesLength());
  const nowSec = Math.floor(Date.now() / 1000);
  const max = Math.min(len, 30);
  for (let i = Math.max(0, len - max); i < len; i++) {
    const b = await rollup.batches(i);
    const proposedAt = Number(b.proposedAt);
    const challenged = Boolean(b.challenged);
    const finalized = Boolean(b.finalized);
    const invalidated = Boolean(b.invalidated);
    if (finalized || invalidated || challenged) continue;
    if (nowSec < proposedAt + CHALLENGE_PERIOD_SECONDS) continue;
    try {
      const ns = await getNonceState();
      if (ns.pending > ns.latest) break;
      const tx = await rollup.finalizeBatch(i, { nonce: ns.latest });
      console.log(`[Proposer] Finalize sent tx=${tx.hash} nonce=${tx.nonce} batchId=${i}`);
      const rcpt = await tx.wait(1, TX_WAIT_TIMEOUT_MS);
      if (!rcpt) continue;
      metrics.finalizations += 1;
      metrics.lastFinalizedAt = Date.now();
      metrics.lastFinalized = { batchId: i, tx: tx.hash };
      break;
    } catch (e) {
      metrics.errors += 1;
      console.error("[Proposer] Finalize failed:", scrubError(e));
      break;
    }
  }
}

function scrubError(e: any) {
  return String(e?.shortMessage ?? e?.reason ?? e?.message ?? e);
}

async function assertChainId(provider: ethers.JsonRpcProvider, expected: bigint | null, label: string): Promise<bigint> {
  const raw = await provider.send("eth_chainId", []);
  const chainId = BigInt(raw);
  if (expected != null && chainId !== expected) {
    throw new Error(`Unexpected ${label} chainId ${chainId} (wanted ${expected})`);
  }
  console.log(`[Startup] ${label} chainId=${chainId} (0x${chainId.toString(16)})`);
  return chainId;
}

async function assertRollupDeployment() {
  const code = await settlement.getCode(ROLLUP);
  if (!code || code === "0x") throw new Error(`No code at rollup address ${ROLLUP}`);
  const codeHash = ethers.keccak256(code);
  if (EXPECTED_ROLLUP_CODE_HASH && codeHash.toLowerCase() !== EXPECTED_ROLLUP_CODE_HASH.toLowerCase()) {
    throw new Error(`Rollup code hash mismatch: got ${codeHash}, expected ${EXPECTED_ROLLUP_CODE_HASH}`);
  }
  console.log(`[Startup] Rollup code hash ${codeHash}`);
}

async function assertChallengePeriod() {
  const onchain = Number(await rollup.challengePeriodSeconds());
  if (Number.isFinite(onchain) && onchain !== CHALLENGE_PERIOD_SECONDS) {
    throw new Error(
      `Challenge period mismatch: env=${CHALLENGE_PERIOD_SECONDS}s onchain=${onchain}s (update CHALLENGE_PERIOD_SECONDS or contract)`
    );
  }
}

async function bootstrapSafety() {
  await assertChainId(settlement, EXPECTED_SETTLEMENT_CHAIN_ID, "settlement");
  await assertChainId(child, EXPECTED_CHILD_CHAIN_ID, "child");
  await assertRollupDeployment();
  await assertChallengePeriod();
}

let inFlight = false;
let state: Cursor = await loadCursor();

await bootstrapSafety().catch((e) => {
  console.error("[Proposer] Startup failed:", scrubError(e));
  process.exit(1);
});

async function tick() {
  if (inFlight) return;
  inFlight = true;
  metrics.lastTickStartedAt = Date.now();
  metrics.lastTickError = null;
  try {
    await proposeNextBatch();
    await finalizeSome();
  } catch (e) {
    metrics.errors += 1;
    const err = scrubError(e);
    metrics.lastTickError = err;
    console.error("[Proposer] Tick failed:", err);
  } finally {
    metrics.lastTickFinishedAt = Date.now();
    inFlight = false;
  }
}

tick();
setInterval(tick, 2000);

setInterval(() => {
  if (!inFlight || !metrics.lastTickStartedAt) return;
  const stalledMs = Date.now() - metrics.lastTickStartedAt;
  if (stalledMs <= WATCHDOG_STALL_MS) return;
  console.error(`[Watchdog] Tick stalled for ${stalledMs}ms (threshold=${WATCHDOG_STALL_MS}ms). Exiting for restart.`);
  process.exit(1);
}, 5_000);

const app = express();
app.get("/health", async (_req: Request, res: Response) => {
  try {
    const settlementChainId = await settlement.send("eth_chainId", []);
    const childChainId = await child.send("eth_chainId", []);
    res.json({
      ok: true,
      observeOnly,
      rpcTimeoutMs: RPC_TIMEOUT_MS,
      txWaitTimeoutMs: TX_WAIT_TIMEOUT_MS,
      watchdogStallMs: WATCHDOG_STALL_MS,
      catchupLagThreshold: CATCHUP_LAG_THRESHOLD,
      catchupBatchSize: CATCHUP_BATCH_SIZE,
      blockFetchParallelism: BLOCK_FETCH_PARALLELISM,
      settlementChainId,
      childChainId,
      rollup: ROLLUP,
      childHeadTag: CHILD_HEAD_TAG,
      confirmations: CONFIRMATIONS,
      batchSize: BATCH_SIZE,
      challengePeriodSeconds: CHALLENGE_PERIOD_SECONDS,
      nextChildBlock: state.nextChildBlock,
      metrics
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: scrubError(e) });
  }
});

app.get("/metrics", (_req: Request, res: Response) => res.json({ ok: true, ...metrics }));

function promLine(name: string, value: number | string, labels?: Record<string, string>) {
  const l = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}=\"${String(v).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}\"`)
        .join(",")}}`
    : "";
  return `${name}${l} ${value}\n`;
}

app.get("/metrics/prom", (_req: Request, res: Response) => {
  res.type("text/plain; version=0.0.4");
  let out = "";
  out += promLine("ghost_rollup_proposer_up", 1);
  out += promLine("ghost_rollup_proposer_observe_only", observeOnly ? 1 : 0);
  out += promLine("ghost_rollup_proposer_proposals_total", metrics.proposals);
  out += promLine("ghost_rollup_proposer_finalizations_total", metrics.finalizations);
  out += promLine("ghost_rollup_proposer_errors_total", metrics.errors);
  out += promLine("ghost_rollup_proposer_batch_size", BATCH_SIZE);
  out += promLine("ghost_rollup_proposer_challenge_period_seconds", CHALLENGE_PERIOD_SECONDS);
  res.send(out);
});
app.listen(PORT, () => console.log(`Ghost Rollup Proposer listening on :${PORT}`));
