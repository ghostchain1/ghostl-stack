import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7272");
const RPC_SETTLEMENT = process.env.RPC_SETTLEMENT!;
const RPC_CHILD = process.env.RPC_CHILD!;
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

if (!RPC_SETTLEMENT || !RPC_CHILD || !ROLLUP) {
  console.error("Missing env: RPC_SETTLEMENT, RPC_CHILD, ROLLUP_ADDRESS");
  process.exit(1);
}
const observeOnly = !PROPOSER_PRIVATE_KEY;

const settlement = new ethers.JsonRpcProvider(RPC_SETTLEMENT, undefined, { polling: true });
settlement.pollingInterval = 1000;
const child = new ethers.JsonRpcProvider(RPC_CHILD, undefined, { polling: true });
child.pollingInterval = 1000;

const signer = observeOnly ? null : new ethers.NonceManager(new ethers.Wallet(PROPOSER_PRIVATE_KEY, settlement));

const rollupAbi = [
  "function proposeBatch(uint256 startBlock, uint256 endBlock, bytes32 root) external returns (uint256)",
  "function finalizeBatch(uint256 batchId) external",
  "function batchesLength() view returns (uint256)",
  "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)",
  "function challengePeriodSeconds() view returns (uint256)",
  "event BatchProposed(uint256 indexed batchId, uint256 indexed startBlock, uint256 indexed endBlock, bytes32 root)",
  "event BatchFinalized(uint256 indexed batchId)"
];
const rollup = new ethers.Contract(ROLLUP, rollupAbi, signer ?? settlement);

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

const metrics = {
  startedAt: Date.now(),
  observeOnly,
  proposals: 0,
  finalizations: 0,
  errors: 0,
  lastProposed: null as any,
  lastFinalized: null as any
};

async function proposeNextBatch() {
  if (observeOnly) return;
  const latest = await child.getBlockNumber();
  const scanTo = Math.max(0, latest - CONFIRMATIONS);

  if (state.nextChildBlock == null) {
    // Start slightly behind latest to avoid empty early history.
    state.nextChildBlock = Math.max(0, scanTo - 50);
  }
  if (state.nextChildBlock > scanTo) return;

  const start = state.nextChildBlock;
  const end = Math.min(scanTo, start + BATCH_SIZE - 1);

  const leaves: Array<string> = [];
  for (let n = start; n <= end; n++) {
    const b = await child.getBlock(n);
    if (!b?.hash) throw new Error(`missing block hash for child block ${n}`);
    leaves.push(hashLeaf(n, b.hash));
  }
  const root = merkleRoot(leaves);

  const tx = await rollup.proposeBatch(start, end, root);
  const rcpt = await tx.wait();

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
  metrics.lastProposed = { batchId, start, end, root, tx: tx.hash };
  state.nextChildBlock = end + 1;
  await saveCursor(state);
}

async function finalizeSome() {
  if (observeOnly) return;
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
      const tx = await rollup.finalizeBatch(i);
      await tx.wait();
      metrics.finalizations += 1;
      metrics.lastFinalized = { batchId: i, tx: tx.hash };
    } catch {
      // ignore
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
  try {
    await proposeNextBatch();
    await finalizeSome();
  } catch (e) {
    metrics.errors += 1;
    console.error("[Proposer] Tick failed:", scrubError(e));
  } finally {
    inFlight = false;
  }
}

tick();
setInterval(tick, 2000);

const app = express();
app.get("/health", async (_req, res) => {
  try {
    const settlementChainId = await settlement.send("eth_chainId", []);
    const childChainId = await child.send("eth_chainId", []);
    res.json({
      ok: true,
      observeOnly,
      settlementChainId,
      childChainId,
      rollup: ROLLUP,
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

app.get("/metrics", (_req, res) => res.json({ ok: true, ...metrics }));

function promLine(name: string, value: number | string, labels?: Record<string, string>) {
  const l = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}=\"${String(v).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}\"`)
        .join(",")}}`
    : "";
  return `${name}${l} ${value}\n`;
}

app.get("/metrics/prom", (_req, res) => {
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
