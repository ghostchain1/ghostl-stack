import "dotenv/config";
import express from "express";
import { ghost } from "ghost";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7282");
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || "1500");
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || "2"));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || "30000"));
const registryCache: { data: any; expiresAt: number } = { data: null, expiresAt: 0 };
const RPC_SETTLEMENT = process.env.RPC_SETTLEMENT || "";
const RPC_CHILD = process.env.RPC_CHILD || "";
const ROLLUP = process.env.ROLLUP_ADDRESS!;
const CHALLENGER_PRIVATE_KEY = process.env.CHALLENGER_PRIVATE_KEY || "";
const STATE_DIR = process.env.STATE_DIR || "/state";
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "0");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;
const childHeadTagRaw = (process.env.CHILD_HEAD_TAG || process.env.ROLLUP_CHILD_HEAD_TAG || "safe").toLowerCase();
const CHILD_HEAD_TAG: "safe" | "finalized" | "latest" =
  childHeadTagRaw === "finalized" ? "finalized" : childHeadTagRaw === "latest" ? "latest" : "safe";
const DRY_RUN = process.env.CHALLENGER_DRY_RUN === "1";

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

const observeOnly = !CHALLENGER_PRIVATE_KEY;

const settlement = new ghost.JsonRpcProvider(RPC_SETTLEMENT_RESOLVED, undefined, { polling: true });
settlement.pollingInterval = 1000;
const child = new ghost.JsonRpcProvider(RPC_CHILD_RESOLVED, undefined, { polling: true });
child.pollingInterval = 1000;

const signer = observeOnly ? null : new ghost.NonceManager(new ghost.Wallet(CHALLENGER_PRIVATE_KEY, settlement));

const rollupAbi = [
  "function batchesLength() view returns (uint256)",
  "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)",
  "function challengeBatch(uint256 batchId, string reason) external",
  "event BatchChallenged(uint256 indexed batchId, address indexed challenger, string reason)"
];
const rollup = new ghost.Contract(ROLLUP, rollupAbi, signer ?? settlement);

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
  return ghost.keccak256(
    ghost.solidityPacked(["uint256", "bytes32"], [BigInt(blockNumber), blockHash as `0x${string}`])
  );
}

function hashPair(a: string, b: string): string {
  return ghost.keccak256(ghost.concat([a as `0x${string}`, b as `0x${string}`]));
}

function merkleRoot(leaves: Array<string>): string {
  if (leaves.length === 0) return ghost.ZeroHash;
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

async function getStableChildHeadNumber(): Promise<number> {
  if (CHILD_HEAD_TAG !== "latest") {
    try {
      const blk = await child.getBlock(CHILD_HEAD_TAG);
      const n = blk?.number;
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
    } catch (e) {
      console.warn(
        `[Challenger] Failed to fetch child head tag=${CHILD_HEAD_TAG}; falling back to latest-confirmations`,
        scrubError(e)
      );
    }
  }
  const latest = await child.getBlockNumber();
  return Math.max(0, latest - CONFIRMATIONS);
}

const metrics = {
  startedAt: Date.now(),
  observeOnly,
  dryRun: DRY_RUN,
  checks: 0,
  mismatches: 0,
  challengesSent: 0,
  errors: 0,
  triggers: 0,
  triggerErrors: 0,
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

  const scanTo = await getStableChildHeadNumber();
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
  if (observeOnly || DRY_RUN) {
    metrics.lastChallenged = { batchId, tx: null, reason, dryRun: true };
    return;
  }

  const tx = await rollup.challengeBatch(batchId, reason);
  await tx.wait();
  metrics.challengesSent += 1;
  metrics.lastChallenged = { batchId, tx: tx.hash, reason, dryRun: false };
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
app.use(express.json({ limit: "1mb" }));

app.post("/trigger", async (req, res) => {
  if (inFlight) return res.status(429).json({ ok: false, error: "busy" });
  const batchIdRaw = req.body?.batchId;
  metrics.triggers += 1;
  try {
    if (batchIdRaw !== undefined) {
      const n = Number(batchIdRaw);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ ok: false, error: "invalid batchId" });
      await checkOneBatch(Math.floor(n));
      metrics.lastChecked = { batchId: Math.floor(n), forced: true };
    } else {
      await tick();
    }
    res.json({ ok: true, observeOnly, dryRun: DRY_RUN, lastChecked: metrics.lastChecked, lastChallenged: metrics.lastChallenged });
  } catch (e: any) {
    metrics.triggerErrors += 1;
    res.status(500).json({ ok: false, error: scrubError(e) });
  }
});

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
      childHeadTag: CHILD_HEAD_TAG,
      confirmations: CONFIRMATIONS,
      nextBatchToCheck: state.nextBatchToCheck,
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
  out += promLine("ghost_rollup_challenger_up", 1);
  out += promLine("ghost_rollup_challenger_observe_only", observeOnly ? 1 : 0);
  out += promLine("ghost_rollup_challenger_dry_run", DRY_RUN ? 1 : 0);
  out += promLine("ghost_rollup_challenger_checks_total", metrics.checks);
  out += promLine("ghost_rollup_challenger_mismatches_total", metrics.mismatches);
  out += promLine("ghost_rollup_challenger_challenges_sent_total", metrics.challengesSent);
  out += promLine("ghost_rollup_challenger_errors_total", metrics.errors);
  out += promLine("ghost_rollup_challenger_triggers_total", metrics.triggers);
  out += promLine("ghost_rollup_challenger_trigger_errors_total", metrics.triggerErrors);
  out += promLine("ghost_rollup_challenger_confirmations", CONFIRMATIONS);
  res.send(out);
});
app.listen(PORT, () => console.log(`Ghost Rollup Challenger listening on :${PORT}`));
