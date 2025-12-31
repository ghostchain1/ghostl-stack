import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7282");
const RPC_SETTLEMENT = process.env.RPC_SETTLEMENT!;
const RPC_CHILD = process.env.RPC_CHILD!;
const ROLLUP = process.env.ROLLUP_ADDRESS!;
const CHALLENGER_PRIVATE_KEY = process.env.CHALLENGER_PRIVATE_KEY || "";
const STATE_DIR = process.env.STATE_DIR || "/state";
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "0");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;

if (!RPC_SETTLEMENT || !RPC_CHILD || !ROLLUP) {
  console.error("Missing env: RPC_SETTLEMENT, RPC_CHILD, ROLLUP_ADDRESS");
  process.exit(1);
}

const observeOnly = !CHALLENGER_PRIVATE_KEY;

const settlement = new ethers.JsonRpcProvider(RPC_SETTLEMENT, undefined, { polling: true });
settlement.pollingInterval = 1000;
const child = new ethers.JsonRpcProvider(RPC_CHILD, undefined, { polling: true });
child.pollingInterval = 1000;

const signer = observeOnly ? null : new ethers.NonceManager(new ethers.Wallet(CHALLENGER_PRIVATE_KEY, settlement));

const rollupAbi = [
  "function batchesLength() view returns (uint256)",
  "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)",
  "function challengeBatch(uint256 batchId, string reason) external",
  "event BatchChallenged(uint256 indexed batchId, address indexed challenger, string reason)"
];
const rollup = new ethers.Contract(ROLLUP, rollupAbi, signer ?? settlement);

type State = { nextBatchToCheck: number | null };
const statePath = path.join(STATE_DIR, "state.json");

async function loadState(): Promise<State> {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<State>;
    const n = parsed.nextBatchToCheck;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return { nextBatchToCheck: Math.floor(n) };
  } catch {
    // ignore
  }
  return { nextBatchToCheck: null };
}

async function saveState(s: State) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${statePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2) + "\n", "utf8");
  await fs.rename(tmp, statePath);
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

async function getBlockHashWithRetry(n: number): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const b = await child.getBlock(n);
    if (b?.hash) return b.hash;
    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  throw new Error(`missing block hash for child block ${n}`);
}

function scrubError(e: any) {
  return String(e?.shortMessage ?? e?.reason ?? e?.message ?? e);
}

const metrics = {
  startedAt: Date.now(),
  observeOnly,
  checks: 0,
  mismatches: 0,
  challengesSent: 0,
  errors: 0,
  lastChecked: null as any,
  lastChallenged: null as any
};

let inFlight = false;
let state: State = await loadState();

async function checkOneBatch(batchId: number) {
  const b = await rollup.batches(batchId);
  const start = Number(b.startBlock);
  const end = Number(b.endBlock);
  const onchainRoot = String(b.root);
  const challenged = Boolean(b.challenged);
  const finalized = Boolean(b.finalized);
  const invalidated = Boolean(b.invalidated);

  // If already handled, move on.
  if (finalized || invalidated) return;
  if (challenged) return;

  const latest = await child.getBlockNumber();
  const scanTo = Math.max(0, latest - CONFIRMATIONS);
  if (end > scanTo) return; // don't challenge until the child range is stable enough

  const leaves: Array<string> = [];
  for (let n = start; n <= end; n++) {
    const h = await getBlockHashWithRetry(n);
    leaves.push(hashLeaf(n, h));
  }
  const computed = merkleRoot(leaves);

  metrics.checks += 1;
  metrics.lastChecked = { batchId, start, end, onchainRoot, computed };

  if (computed === onchainRoot) return;

  metrics.mismatches += 1;
  const reason = `root mismatch computed=${computed}`;
  if (observeOnly) return;

  const tx = await rollup.challengeBatch(batchId, reason);
  await tx.wait();
  metrics.challengesSent += 1;
  metrics.lastChallenged = { batchId, tx: tx.hash, reason };
}

async function tick() {
  if (inFlight) return;
  inFlight = true;
  try {
    const len = Number(await rollup.batchesLength());
    if (state.nextBatchToCheck == null) state.nextBatchToCheck = Math.max(0, len - 10);
    if (state.nextBatchToCheck >= len) return;

    // Check a few batches per tick.
    const maxPerTick = 2;
    let did = 0;
    while (state.nextBatchToCheck < len && did < maxPerTick) {
      await checkOneBatch(state.nextBatchToCheck);
      state.nextBatchToCheck += 1;
      did += 1;
    }
    await saveState(state);
  } catch (e) {
    metrics.errors += 1;
    console.error("[Challenger] Tick failed:", scrubError(e));
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
      nextBatchToCheck: state.nextBatchToCheck,
      metrics
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: scrubError(e) });
  }
});
app.get("/metrics", (_req, res) => res.json({ ok: true, ...metrics }));
app.listen(PORT, () => console.log(`Ghost Rollup Challenger listening on :${PORT}`));

