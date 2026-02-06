import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7171");
const registryUrl = process.env.RPC_REGISTRY_URL || "http://ghost-registry:8088/v1/endpoints";
const registryTimeoutMs = Number(process.env.REGISTRY_TIMEOUT_MS || "1500");
const registryRetries = Math.max(0, Number(process.env.REGISTRY_RETRY_COUNT || "2"));
const registryCacheMs = Math.max(1000, Number(process.env.REGISTRY_CACHE_MS || "30000"));
const registryCache: { data: any; expiresAt: number } = { data: null, expiresAt: 0 };
const BRIDGE = process.env.BRIDGE_L2L3_ADDRESS!;
const L1_ROLLUP_L2 = process.env.L1_ROLLUP_L2_ADDRESS || "";
const L2_ROLLUP_L3 = process.env.L2_ROLLUP_L3_ADDRESS || "";
const L3_INBOX = process.env.L3_INBOX_ADDRESS!;
const L3_TOKEN_FACTORY = process.env.L3_TOKEN_FACTORY_ADDRESS!;
const readSecret = async (key: string): Promise<string> => {
  const filePath = process.env[`${key}_FILE`] || "";
  if (filePath) {
    try {
      const value = String(await fs.readFile(filePath, "utf8")).trim();
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return process.env[key] || "";
};
const RELAYER_PRIVATE_KEY = await readSecret("RELAYER_PRIVATE_KEY");
const L2_RELAYER_PRIVATE_KEY = await readSecret("L2_RELAYER_PRIVATE_KEY");
const STATE_DIR = process.env.STATE_DIR || "/state";
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "0");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;

const REQUIRE_L2_FINALITY_ON_L1 =
  (process.env.RELAYER_REQUIRE_L2_FINALITY_ON_L1 || "false").toLowerCase() === "true";
const REQUIRE_L3_FINALITY_ON_L2 =
  (process.env.RELAYER_REQUIRE_L3_FINALITY_ON_L2 || "false").toLowerCase() === "true";

type CanonicalGasTokenMode = "native" | "erc20";

// In this stack, L2/L3 commonly use the native gas token (GST) for fees.
// We keep an optional "canonical gas token" balance gate for production,
// but default it to "native" + zero-minimum so dev relaying doesn't wedge.
const CANONICAL_GAS_TOKEN_MODE = (process.env.CANONICAL_GAS_TOKEN_MODE || "native") as CanonicalGasTokenMode;
const CANONICAL_GAS_TOKEN_ADDRESS =
  process.env.CANONICAL_GAS_TOKEN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CANONICAL_GAS_TOKEN_SYMBOL = process.env.CANONICAL_GAS_TOKEN_SYMBOL || "GHOST";
const minGasTokenBalanceRaw = process.env.CANONICAL_GAS_TOKEN_MIN_BALANCE || "0";
let MIN_CANONICAL_GAS_TOKEN_BALANCE = 1n;
try {
  MIN_CANONICAL_GAS_TOKEN_BALANCE = BigInt(minGasTokenBalanceRaw);
} catch {
  MIN_CANONICAL_GAS_TOKEN_BALANCE = 0n;
}
const gasTokenCacheTtlMs = Math.max(1_000, Number(process.env.CANONICAL_GAS_TOKEN_CACHE_MS || "15000"));
const gasTokenCache = new Map<string, { balance: bigint; checkedAt: number }>();
const canonicalGasTokenAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)"
];

const gasTokenCacheKey = (chainLabel: "l2" | "l3", account: string) => `${chainLabel}:${account.toLowerCase()}`;

async function ensureGasTokenBalance(chainLabel: "l2" | "l3", provider: ethers.Provider, signer: ethers.Signer | null) {
  if (!signer) return;
  if (MIN_CANONICAL_GAS_TOKEN_BALANCE === 0n) return;
  const account = await signer.getAddress();
  const cacheKey = gasTokenCacheKey(chainLabel, account);
  const cached = gasTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.checkedAt < gasTokenCacheTtlMs) {
    if (cached.balance < MIN_CANONICAL_GAS_TOKEN_BALANCE) {
      throw new Error(
        `insufficient ${CANONICAL_GAS_TOKEN_SYMBOL} balance on ${chainLabel} for relayer ${account}: ${cached.balance}`
      );
    }
    return;
  }
  let balance: bigint;
  if (CANONICAL_GAS_TOKEN_MODE === "native") {
    balance = await provider.getBalance(account);
  } else if (CANONICAL_GAS_TOKEN_MODE === "erc20") {
    // Fail loudly on misconfig rather than returning empty "0x" results.
    const code = await provider.getCode(CANONICAL_GAS_TOKEN_ADDRESS);
    if (!code || code === "0x") {
      throw new Error(
        `canonical gas token contract missing on ${chainLabel}: address=${CANONICAL_GAS_TOKEN_ADDRESS}`
      );
    }
    const token = new ethers.Contract(CANONICAL_GAS_TOKEN_ADDRESS, canonicalGasTokenAbi, provider);
    let symbol = CANONICAL_GAS_TOKEN_SYMBOL;
    try {
      symbol = String(await token.symbol());
    } catch {
      symbol = CANONICAL_GAS_TOKEN_SYMBOL;
    }
    if (symbol !== CANONICAL_GAS_TOKEN_SYMBOL) {
      throw new Error(
        `canonical gas token symbol mismatch on ${chainLabel}: expected ${CANONICAL_GAS_TOKEN_SYMBOL}, got ${symbol}`
      );
    }
    const balanceRaw = await token.balanceOf(account);
    balance = typeof balanceRaw === "bigint" ? balanceRaw : BigInt(String(balanceRaw));
  } else {
    throw new Error(`unsupported CANONICAL_GAS_TOKEN_MODE=${String(CANONICAL_GAS_TOKEN_MODE)}`);
  }

  gasTokenCache.set(cacheKey, { balance, checkedAt: now });
  if (balance < MIN_CANONICAL_GAS_TOKEN_BALANCE) {
    throw new Error(
      `insufficient ${CANONICAL_GAS_TOKEN_SYMBOL} balance on ${chainLabel} for relayer ${account}: ${balance}`
    );
  }
}

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

const pickRpc = (chain: any) => {
  if (!chain) return "";
  if (typeof chain.rpc === "string" && chain.rpc) return chain.rpc;
  if (Array.isArray(chain.rpcUrls) && chain.rpcUrls.length) return chain.rpcUrls[0];
  if (Array.isArray(chain.endpoints)) {
    const http = chain.endpoints.find((endpoint: any) => endpoint.protocol === "http");
    if (http?.url) return http.url;
  }
  if (typeof chain.ws === "string" && chain.ws) return chain.ws;
  if (Array.isArray(chain.wsUrls) && chain.wsUrls.length) return chain.wsUrls[0];
  return "";
};

const resolveRpcUrls = async () => {
  const overrides = {
    l1: process.env.RPC_L1,
    l2: process.env.RPC_L2,
    l3: process.env.RPC_L3
  };

  // Production should prefer the RPC registry for allowlisting and discovery.
  // For local/dev, make the registry an optimization: fall back to explicit env overrides if the registry is down/slow.
  let registry: any;
  try {
    registry = await fetchRegistry();
  } catch (e) {
    if (overrides.l2 && overrides.l3) {
      const msg = `[Startup] RPC registry unavailable; falling back to explicit RPC_L* overrides. err=${String(
        (e as any)?.message ?? e
      )}`;
      console.warn(msg);
      return { l1: overrides.l1 || "", l2: overrides.l2, l3: overrides.l3 };
    }
    throw e;
  }

  const chainL1 = registry.chains.find((entry: any) => entry.layer === "L1");
  const chainL2 = registry.chains.find((entry: any) => entry.layer === "L2");
  const chainL3 = registry.chains.find((entry: any) => entry.layer === "L3");
  const allowed = (chain: any) =>
    new Set([
      ...(typeof chain?.rpc === "string" && chain.rpc ? [chain.rpc] : []),
      ...(Array.isArray(chain?.rpcUrls) ? chain.rpcUrls : []),
      ...(Array.isArray(chain?.endpoints) ? chain.endpoints.map((endpoint: any) => endpoint.url) : [])
    ]);
  const l1Allowed = allowed(chainL1);
  const l2Allowed = allowed(chainL2);
  const l3Allowed = allowed(chainL3);
  const l1 = overrides.l1 ? (l1Allowed.has(overrides.l1) ? overrides.l1 : "") : pickRpc(chainL1);
  const l2 = overrides.l2 ? (l2Allowed.has(overrides.l2) ? overrides.l2 : "") : pickRpc(chainL2);
  const l3 = overrides.l3 ? (l3Allowed.has(overrides.l3) ? overrides.l3 : "") : pickRpc(chainL3);
  if (overrides.l1 && !l1) throw new Error("rpc_override_not_in_registry_l1");
  if (overrides.l2 && !l2) throw new Error("rpc_override_not_in_registry_l2");
  if (overrides.l3 && !l3) throw new Error("rpc_override_not_in_registry_l3");
  if (!l2 || !l3) throw new Error("rpc_missing_l2_or_l3");
  return { l1, l2, l3 };
};

const { l1: RPC_L1, l2: RPC_L2, l3: RPC_L3 } = await resolveRpcUrls();

if (!RPC_L2 || !RPC_L3 || !BRIDGE || !L3_INBOX || !L3_TOKEN_FACTORY) {
  console.error("Missing env: RPC_L2, RPC_L3, BRIDGE_L2L3_ADDRESS, L3_INBOX_ADDRESS, L3_TOKEN_FACTORY_ADDRESS");
  process.exit(1);
}

const bridgeAbi = [
  "event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce)",
  "event Finalized(address indexed from, address indexed to, uint256 amount, uint256 nonce)",
  "event ERC20DepositInitiated(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)",
  "event ERC20Finalized(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)"
];

const inboxAbi = [
  "function finalizeFromL2(address from, address to, uint256 amount, uint256 nonce) external",
  "function processed(bytes32 key) view returns (bool)"
];

const depositTopic = ethers.id("DepositInitiated(address,address,uint256,uint256)");
const finalizedTopic = ethers.id("Finalized(address,address,uint256,uint256)");
const erc20DepositTopic = ethers.id("ERC20DepositInitiated(address,address,address,uint256,uint256)");
const erc20FinalizedTopic = ethers.id("ERC20Finalized(address,address,address,uint256,uint256)");
const bridgeIface = new ethers.Interface(bridgeAbi);

const l2Erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const l3FactoryAbi = [
  "function l3TokenForL2Token(address l2Token) view returns (address)",
  "function getOrDeployBridgedToken(address l2Token, string name, string symbol, uint8 decimals) external returns (address)",
  "event BridgedTokenDeployed(address indexed l2Token, address indexed l3Token, string name, string symbol, uint8 decimals)"
];

const l3TokenAbi = [
  "function mintFromL2(address from, address to, uint256 amount, uint256 nonce) external",
  "function processed(bytes32 key) view returns (bool)",
  "function l2Token() view returns (address)",
  "event BurnInitiated(address indexed l2Token, address indexed from, address indexed to, uint256 amount, uint256 nonce, bytes32 key)"
];

const l2Provider = new ethers.JsonRpcProvider(RPC_L2, undefined, { polling: true });
l2Provider.pollingInterval = 1000;

const l3Provider = new ethers.JsonRpcProvider(RPC_L3, undefined, { polling: true });
l3Provider.pollingInterval = 1000;

const l1Provider = RPC_L1 ? new ethers.JsonRpcProvider(RPC_L1, undefined, { polling: true }) : null;
if (l1Provider) l1Provider.pollingInterval = 1000;

const observeOnly = !RELAYER_PRIVATE_KEY;
const l3Signer = observeOnly ? null : new ethers.NonceManager(new ethers.Wallet(RELAYER_PRIVATE_KEY, l3Provider));
const l2Key = L2_RELAYER_PRIVATE_KEY || RELAYER_PRIVATE_KEY;
const l2Signer = l2Key ? new ethers.NonceManager(new ethers.Wallet(l2Key, l2Provider)) : null;
const inbox = new ethers.Contract(L3_INBOX, inboxAbi, l3Signer ?? l3Provider);
const l3Factory = new ethers.Contract(L3_TOKEN_FACTORY, l3FactoryAbi, l3Signer ?? l3Provider);

const rollupAbi = [
  "function batchesLength() view returns (uint256)",
  "function batches(uint256) view returns (uint256 startBlock,uint256 endBlock,bytes32 root,uint256 proposedAt,bool challenged,bool finalized,bool invalidated)"
];
const l1Rollup = l1Provider && L1_ROLLUP_L2 ? new ethers.Contract(L1_ROLLUP_L2, rollupAbi, l1Provider) : null;
const l2Rollup = L2_ROLLUP_L3 ? new ethers.Contract(L2_ROLLUP_L3, rollupAbi, l2Provider) : null;

type LogEntry = { ts: number; level: "info" | "warn" | "error"; msg: string; data?: any };
const logBuffer: Array<LogEntry> = [];
function pushLog(level: LogEntry["level"], msg: string, data?: any) {
  logBuffer.push({ ts: Date.now(), level, msg, data });
  while (logBuffer.length > 200) logBuffer.shift();
}

const metrics = {
  startedAt: Date.now(),
  l2Polls: 0,
  l3Polls: 0,
  l2LogsSeen: 0,
  l3LogsSeen: 0,
  depositsSeen: 0,
  erc20DepositsSeen: 0,
  finalizedSeen: 0,
  erc20FinalizedSeen: 0,
  burnsSeen: 0,
  releaseAttempts: 0,
  releaseBlockedRollup: 0,
  releaseErrors: 0,
  finalizeAttempts: 0,
  finalizeSuccess: 0,
  finalizeBlockedPolicy: 0,
  finalizeBlockedRollup: 0,
  finalizeErrors: 0,
  relayedToL3: 0,
  releasedToL2: 0,
  errors: 0
};

let nextL2BlockToScan: number | null = null;
let nextL3BlockToScan: number | null = null;
let pollL2InFlight = false;
let pollL3InFlight = false;
let lastRelayed: any = null;
let lastSeen: any = null;
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

type CursorState = { nextBlockToScan: number | null };
function cursorPathFor(name: "l2" | "l3") {
  return path.join(STATE_DIR, `${name}_cursor.json`);
}

async function loadCursor(name: "l2" | "l3"): Promise<CursorState> {
  try {
    const raw = await fs.readFile(cursorPathFor(name), "utf8");
    const parsed = JSON.parse(raw) as Partial<CursorState>;
    const n = parsed.nextBlockToScan;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return { nextBlockToScan: Math.floor(n) };
  } catch {
    // ignore
  }
  return { nextBlockToScan: null };
}

async function saveCursor(name: "l2" | "l3", state: CursorState) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const p = cursorPathFor(name);
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmp, p);
}

function msgKeyEth(from: string, to: string, amount: bigint, nonce: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint256", "uint256"], [from, to, amount, nonce])
  );
}

function msgKeyErc20(token: string, from: string, to: string, amount: bigint, nonce: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "uint256"],
      [token, from, to, amount, nonce]
    )
  );
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

const verifiedBatchCache = new Set<string>();
async function verifyFinalizedBatchContainsBlock(opts: {
  rollup: ethers.Contract | null;
  settlementName: "l1" | "l2";
  childProvider: ethers.JsonRpcProvider;
  childBlockNumber: number;
  childBlockHash: string;
}): Promise<boolean> {
  const { rollup, settlementName, childProvider, childBlockNumber, childBlockHash } = opts;
  if (!rollup) return true; // gating disabled

  const len = Number(await rollup.batchesLength());
  const maxScan = Math.min(len, 50);
  for (let i = len - 1; i >= Math.max(0, len - maxScan); i--) {
    const b = await rollup.batches(i);
    const start = Number(b.startBlock);
    const end = Number(b.endBlock);
    const root = String(b.root);
    const finalized = Boolean(b.finalized);
    const challenged = Boolean(b.challenged);
    const invalidated = Boolean(b.invalidated);
    if (!finalized || challenged || invalidated) continue;
    if (childBlockNumber < start || childBlockNumber > end) continue;

    const cacheKey = `${settlementName}:${rollup.target}:${i}:${root}`;
    if (!verifiedBatchCache.has(cacheKey)) {
      // Verify root matches the actual child chain blocks (dev-friendly correctness check).
      const blocks = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, j) => childProvider.getBlock(start + j))
      );
      const leaves: Array<string> = [];
      for (const [j, blk] of blocks.entries()) {
        if (!blk?.hash) return false;
        leaves.push(hashLeaf(start + j, blk.hash));
      }
      const computed = merkleRoot(leaves);
      if (computed !== root) return false;
      verifiedBatchCache.add(cacheKey);
    }

    // Ensure the specific leaf exists as expected (cheap sanity check).
    const expectedLeaf = hashLeaf(childBlockNumber, childBlockHash);
    const targetBlock = await childProvider.getBlock(childBlockNumber);
    if (!targetBlock?.hash) return false;
    const actualLeaf = hashLeaf(childBlockNumber, targetBlock.hash);
    if (expectedLeaf !== actualLeaf) return false;

    return true;
  }
  return false;
}

type PendingFinalize =
  | {
      kind: "DepositInitiated";
      key: string;
      from: string;
      to: string;
      amount: string;
      nonce: string;
      l2BlockNumber: number;
      l2BlockHash: string;
      firstSeen: number;
      lastAttempt: number | null;
      attempts: number;
    }
  | {
      kind: "ERC20DepositInitiated";
      key: string;
      token: string;
      from: string;
      to: string;
      amount: string;
      nonce: string;
      l2BlockNumber: number;
      l2BlockHash: string;
      firstSeen: number;
      lastAttempt: number | null;
      attempts: number;
    }
  | {
      kind: "BurnInitiated";
      key: string;
      l2Token: string;
      from: string;
      to: string;
      amount: string;
      nonce: string;
      l3BlockNumber: number;
      l3BlockHash: string;
      firstSeen: number;
      lastAttempt: number | null;
      attempts: number;
      l3Tx: string;
    };

type PendingKind = PendingFinalize["kind"];
function pendingId(kind: PendingKind, key: string): string {
  return `${kind}:${key.toLowerCase()}`;
}

const pendingByKey = new Map<string, PendingFinalize>();
const pendingPath = path.join(STATE_DIR, "pending.json");

async function loadPending() {
  try {
    const raw = await fs.readFile(pendingPath, "utf8");
    const parsed = JSON.parse(raw) as { pending?: Array<PendingFinalize> };
    for (const p of parsed.pending ?? []) {
      const kind = (p as any)?.kind;
      const key = (p as any)?.key;
      if (
        (kind === "DepositInitiated" || kind === "ERC20DepositInitiated" || kind === "BurnInitiated") &&
        typeof key === "string" &&
        key.startsWith("0x")
      ) {
        pendingByKey.set(pendingId(kind, key), p);
      }
    }
  } catch {
    // ignore
  }
}

async function savePending() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${pendingPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ pending: Array.from(pendingByKey.values()) }, null, 2) + "\n", "utf8");
  await fs.rename(tmp, pendingPath);
}

let pendingSaveChain = Promise.resolve();
async function savePendingLocked() {
  const run = async () => savePending();
  const p = pendingSaveChain.then(run, run);
  pendingSaveChain = p.catch(() => {
    // Intentionally swallow to keep the chain alive for subsequent saves.
  });
  return p;
}

function scrubEthersError(e: any): string {
  return String(e?.shortMessage ?? e?.reason ?? e?.message ?? e);
}

function classifyFinalizeError(msg: string): "policy" | "rollup" | "other" {
  const m = msg.toLowerCase();
  if (m.includes("blocked by policy") || m.includes("delay not elapsed")) return "policy";
  if (m.includes("not finalized") || m.includes("rollup")) return "rollup";
  return "other";
}

async function handleFinalizedLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (!parsed) return;
  if (parsed.name === "Finalized") {
    metrics.finalizedSeen += 1;
    const from = parsed.args[0] as string;
    const to = parsed.args[1] as string;
    const amount = parsed.args[2] as bigint;
    const nonce = parsed.args[3] as bigint;

    const key = msgKeyEth(from, to, amount, nonce);
    lastSeen = { kind: "Finalized", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };
    pendingByKey.delete(pendingId("DepositInitiated", key));

    if (observeOnly) {
      const msg = `[Relayer] Observe-only saw Finalized key=${key} l2Tx=${log.transactionHash}`;
      console.log(msg);
      pushLog("info", msg);
      return;
    }

    const already = await inbox.processed(key);
    if (already) return;

    await ensureGasTokenBalance("l3", l3Provider, l3Signer);
    const tx = await inbox.finalizeFromL2(from, to, amount, nonce);
    await tx.wait();

    lastRelayed = { kind: "Finalized", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash, l3Tx: tx.hash };
    metrics.relayedToL3 += 1;
    const msg = `[Relayer] Relayed Finalized key=${key} l2Tx=${log.transactionHash} l3Tx=${tx.hash}`;
    console.log(msg);
    pushLog("info", msg, lastRelayed);
    return;
  }

  if (parsed.name === "ERC20Finalized") {
    metrics.erc20FinalizedSeen += 1;
    const token = parsed.args[0] as string;
    const from = parsed.args[1] as string;
    const to = parsed.args[2] as string;
    const amount = parsed.args[3] as bigint;
    const nonce = parsed.args[4] as bigint;

    const key = msgKeyErc20(token, from, to, amount, nonce);
    lastSeen = { kind: "ERC20Finalized", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };
    pendingByKey.delete(pendingId("ERC20DepositInitiated", key));

    if (observeOnly) {
      const msg = `[Relayer] Observe-only saw ERC20Finalized key=${key} l2Tx=${log.transactionHash}`;
      console.log(msg);
      pushLog("info", msg, { token });
      return;
    }

    await ensureGasTokenBalance("l3", l3Provider, l3Signer);
    let l3TokenAddr = (await l3Factory.l3TokenForL2Token(token)) as string;
    if (!l3TokenAddr || l3TokenAddr === ethers.ZeroAddress) {
      if (observeOnly) {
        console.log(`[Relayer] Observe-only: missing bridged token for ${token} (set RELAYER_PRIVATE_KEY to auto-deploy)`);
        return;
      }

      const l2Token = new ethers.Contract(token, l2Erc20MetaAbi, l2Provider);
      let name = `Bridged ${token.slice(0, 6)}`;
      let symbol = `BRG${token.slice(2, 6)}`;
      let decimals = 18;
      try {
        const [n, s, d] = await Promise.all([l2Token.name(), l2Token.symbol(), l2Token.decimals()]);
        name = `${String(n)} (L3)`;
        symbol = `${String(s)}L3`;
        decimals = Number(d);
      } catch {
        // ignore
      }

      const txDeploy = await l3Factory.getOrDeployBridgedToken(token, name, symbol, decimals);
      const rcpt = await txDeploy.wait();
      l3TokenAddr = (await l3Factory.l3TokenForL2Token(token)) as string;
      if (!l3TokenAddr || l3TokenAddr === ethers.ZeroAddress) {
        const ev = rcpt?.logs
          .map((l: ethers.Log) => {
            try {
              return l3Factory.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((e: ethers.LogDescription | null): e is ethers.LogDescription =>
            Boolean(e && e.name === "BridgedTokenDeployed")
          );
        l3TokenAddr = String(ev?.args?.l3Token ?? "");
      }
    }

    const l3Token = new ethers.Contract(l3TokenAddr, l3TokenAbi, l3Signer ?? l3Provider);
    const already = await l3Token.processed(key);
    if (already) return;

    const tx = await l3Token.mintFromL2(from, to, amount, nonce);
    await tx.wait();

    lastRelayed = { kind: "ERC20Finalized", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash, l3Tx: tx.hash };
    metrics.relayedToL3 += 1;
    const msg = `[Relayer] Relayed ERC20Finalized key=${key} l2Tx=${log.transactionHash} l3Tx=${tx.hash}`;
    console.log(msg);
    pushLog("info", msg, lastRelayed);
  }
}

const l2BridgeAbi = [
  "function releaseERC20FromL3(address token, address from, address to, uint256 amount, uint256 nonce) external",
  "function erc20WithdrawProcessed(bytes32 key) view returns (bool)",
  "function finalizeToL3(address from, address to, uint256 amount, uint256 nonce) external",
  "function finalizeERC20ToL3(address token, address from, address to, uint256 amount, uint256 nonce) external",
  "function depositTime(bytes32 key) view returns (uint256)",
  "function erc20DepositTime(bytes32 key) view returns (uint256)"
];
const l2Bridge = new ethers.Contract(BRIDGE, l2BridgeAbi, l2Signer ?? l2Provider);

const burnTopic = ethers.id("BurnInitiated(address,address,address,uint256,uint256,bytes32)");
const l3TokenIface = new ethers.Interface(l3TokenAbi);

async function tryFinalizeOne(p: PendingFinalize) {
  if (!l2Signer) return;
  const now = Date.now();
  const id = pendingId(p.kind, p.key);
  // simple backoff to avoid spamming the chain on delay/policy/rollup gating
  const backoffMs = Math.min(60_000, 1500 * Math.max(1, Math.min(20, p.attempts + 1)));
  if (p.lastAttempt && now - p.lastAttempt < backoffMs) return;

  try {
    if (p.kind === "BurnInitiated") metrics.releaseAttempts += 1;
    else metrics.finalizeAttempts += 1;

    if (p.kind === "BurnInitiated") {
      if (REQUIRE_L3_FINALITY_ON_L2) {
        const okOnL2 = await verifyFinalizedBatchContainsBlock({
          rollup: l2Rollup,
          settlementName: "l2",
          childProvider: l3Provider,
          childBlockNumber: p.l3BlockNumber,
          childBlockHash: p.l3BlockHash
        });
        if (!okOnL2) throw new Error("L3 block not finalized on L2 rollup");
      }

      const already = await l2Bridge.erc20WithdrawProcessed(
        msgKeyErc20(p.l2Token, p.from, p.to, BigInt(p.amount), BigInt(p.nonce))
      );
      if (already) {
        pendingByKey.delete(id);
        return;
      }

      await ensureGasTokenBalance("l2", l2Provider, l2Signer);
      const tx = await l2Bridge.releaseERC20FromL3(p.l2Token, p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
      await tx.wait();

      pendingByKey.delete(id);
      metrics.releasedToL2 += 1;
      const msg = `[Relayer] Released ERC20 to L2 key=${p.key} l3Tx=${p.l3Tx} l2Tx=${tx.hash}`;
      console.log(msg);
      lastRelayed = {
        kind: "ERC20WithdrawReleased",
        l2Token: p.l2Token,
        from: p.from,
        to: p.to,
        amount: p.amount,
        nonce: p.nonce,
        key: p.key,
        l3Tx: p.l3Tx,
        l2Tx: tx.hash
      };
      pushLog("info", msg, lastRelayed);
      return;
    }

    if (REQUIRE_L2_FINALITY_ON_L1) {
      const okOnL1 = await verifyFinalizedBatchContainsBlock({
        rollup: l1Rollup,
        settlementName: "l1",
        childProvider: l2Provider,
        childBlockNumber: p.l2BlockNumber,
        childBlockHash: p.l2BlockHash
      });
      if (!okOnL1) throw new Error("L2 block not finalized on L1 rollup");
    }

    await ensureGasTokenBalance("l2", l2Provider, l2Signer);
    if (p.kind === "DepositInitiated") {
      const k = msgKeyEth(p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
      const t = (await l2Bridge.depositTime(k)) as bigint;
      if (t === 0n) {
        pendingByKey.delete(id);
        return;
      }
      const tx = await l2Bridge.finalizeToL3(p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
      await tx.wait();
      metrics.finalizeSuccess += 1;
      const msg = `[Relayer] Finalized L2->L3 key=${p.key} l2Tx=${tx.hash}`;
      console.log(msg);
      pushLog("info", msg);
      return;
    }

    const k = msgKeyErc20(p.token, p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
    const t = (await l2Bridge.erc20DepositTime(k)) as bigint;
    if (t === 0n) {
      pendingByKey.delete(id);
      return;
    }
    const tx = await l2Bridge.finalizeERC20ToL3(p.token, p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
    await tx.wait();
    metrics.finalizeSuccess += 1;
    const msg = `[Relayer] Finalized L2 ERC20->L3 key=${p.key} l2Tx=${tx.hash}`;
    console.log(msg);
    pushLog("info", msg);
  } catch (e) {
    p.lastAttempt = Date.now();
    p.attempts += 1;
    const err = scrubEthersError(e);
    const kind = classifyFinalizeError(err);
    if (p.kind === "BurnInitiated") {
      if (kind === "rollup") metrics.releaseBlockedRollup += 1;
      else metrics.releaseErrors += 1;

      if (p.attempts === 1 || p.attempts % 10 === 0) {
        const msg = `[Relayer] Release blocked key=${p.key} kind=${kind} attempts=${p.attempts} err=${err}`;
        pushLog("warn", msg);
      }
      return;
    }

    if (kind === "policy") metrics.finalizeBlockedPolicy += 1;
    else if (kind === "rollup") metrics.finalizeBlockedRollup += 1;
    else metrics.finalizeErrors += 1;

    if (p.attempts === 1 || p.attempts % 10 === 0) {
      const msg = `[Relayer] Finalize blocked key=${p.key} kind=${kind} attempts=${p.attempts} err=${err}`;
      pushLog("warn", msg);
    }
  }
}

async function handleDepositLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (!parsed) return;
  if (parsed.name === "DepositInitiated") {
    metrics.depositsSeen += 1;
    const from = parsed.args[0] as string;
    const to = parsed.args[1] as string;
    const amount = parsed.args[2] as bigint;
    const nonce = parsed.args[3] as bigint;
    const key = msgKeyEth(from, to, amount, nonce);
    const l2BlockNumber = Number(log.blockNumber);
    let l2BlockHash = String(log.blockHash ?? "");
    if (!l2BlockHash) {
      const blk = await l2Provider.getBlock(l2BlockNumber);
      if (!blk?.hash) return;
      l2BlockHash = blk.hash;
    }

    lastSeen = { kind: "DepositInitiated", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    const id = pendingId("DepositInitiated", key);
    if (!pendingByKey.has(id)) {
      pendingByKey.set(id, {
        kind: "DepositInitiated",
        key,
        from,
        to,
        amount: amount.toString(),
        nonce: nonce.toString(),
        l2BlockNumber,
        l2BlockHash,
        firstSeen: Date.now(),
        lastAttempt: null,
        attempts: 0
      });
    }
    return;
  }

  if (parsed.name === "ERC20DepositInitiated") {
    metrics.erc20DepositsSeen += 1;
    const token = parsed.args[0] as string;
    const from = parsed.args[1] as string;
    const to = parsed.args[2] as string;
    const amount = parsed.args[3] as bigint;
    const nonce = parsed.args[4] as bigint;
    const key = msgKeyErc20(token, from, to, amount, nonce);
    const l2BlockNumber = Number(log.blockNumber);
    let l2BlockHash = String(log.blockHash ?? "");
    if (!l2BlockHash) {
      const blk = await l2Provider.getBlock(l2BlockNumber);
      if (!blk?.hash) return;
      l2BlockHash = blk.hash;
    }

    lastSeen = { kind: "ERC20DepositInitiated", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    const id = pendingId("ERC20DepositInitiated", key);
    if (!pendingByKey.has(id)) {
      pendingByKey.set(id, {
        kind: "ERC20DepositInitiated",
        key,
        token,
        from,
        to,
        amount: amount.toString(),
        nonce: nonce.toString(),
        l2BlockNumber,
        l2BlockHash,
        firstSeen: Date.now(),
        lastAttempt: null,
        attempts: 0
      });
    }
  }
}

async function handleBurnLog(log: ethers.Log): Promise<boolean> {
  const parsed = l3TokenIface.parseLog(log);
  if (!parsed) return false;
  metrics.burnsSeen += 1;
  const l2Token = parsed.args[0] as string;
  const from = parsed.args[1] as string;
  const to = parsed.args[2] as string;
  const amount = parsed.args[3] as bigint;
  const nonce = parsed.args[4] as bigint;
  const eventKey = parsed.args[5] as string;
  const key = msgKeyErc20(l2Token, from, to, amount, nonce);

  lastSeen = {
    kind: "BurnInitiated",
    l2Token,
    from,
    to,
    amount: amount.toString(),
    nonce: nonce.toString(),
    key,
    eventKey,
    l3Tx: log.transactionHash
  };

  if (eventKey.toLowerCase() !== key.toLowerCase()) {
    const msg = `[Relayer] BurnInitiated key mismatch eventKey=${eventKey} computed=${key}`;
    console.warn(msg);
    pushLog("warn", msg, { l2Token, l3Tx: log.transactionHash });
  }

  const expectedL3Token = (await l3Factory.l3TokenForL2Token(l2Token)) as string;
  if (!expectedL3Token || expectedL3Token === ethers.ZeroAddress) return false;
  if (ethers.getAddress(expectedL3Token) !== ethers.getAddress(log.address)) return false;

  const l3BlockNumber = Number(log.blockNumber);
  let l3BlockHash = String(log.blockHash ?? "");
  if (!l3BlockHash) {
    const blk = await l3Provider.getBlock(l3BlockNumber);
    if (!blk?.hash) return false;
    l3BlockHash = blk.hash;
  }

  const already = await l2Bridge.erc20WithdrawProcessed(key);
  if (already) {
    pendingByKey.delete(pendingId("BurnInitiated", key));
    return true;
  }

  const id = pendingId("BurnInitiated", key);
  if (!pendingByKey.has(id)) {
    pendingByKey.set(id, {
      kind: "BurnInitiated",
      key,
      l2Token,
      from,
      to,
      amount: amount.toString(),
      nonce: nonce.toString(),
      l3BlockNumber,
      l3BlockHash,
      firstSeen: Date.now(),
      lastAttempt: null,
      attempts: 0,
      l3Tx: log.transactionHash
    });
    return true;
  }
  return false;
}

async function pollL2Once() {
  if (pollL2InFlight) return;
  pollL2InFlight = true;
  try {
    metrics.l2Polls += 1;
    const latest = await l2Provider.getBlockNumber();
    const scanTo = Math.max(0, latest - CONFIRMATIONS);
    if (nextL2BlockToScan == null) {
      const lookback = 100;
      const defaultStart = Math.max(0, scanTo - lookback);
      nextL2BlockToScan =
        START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
    } else if (nextL2BlockToScan > latest + 500) {
      // If the chain has been reset/re-deployed but our cursor is persisted, we can end up permanently skipping scans.
      // Reset to a safe lookback window instead of requiring operators to delete /state.
      const lookback = 100;
      const defaultStart = Math.max(0, scanTo - lookback);
      const resetTo =
        START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
      const msg = `[Relayer] L2 cursor ahead of head; resetting nextBlockToScan=${nextL2BlockToScan} -> ${resetTo} (latest=${latest})`;
      console.warn(msg);
      pushLog("warn", msg, { latest, scanTo, resetTo, nextL2BlockToScan });
      nextL2BlockToScan = resetTo;
      await saveCursor("l2", { nextBlockToScan: nextL2BlockToScan });
    }
    if (nextL2BlockToScan > scanTo) return;

    const logs = await l2Provider.getLogs({
      address: BRIDGE,
      fromBlock: nextL2BlockToScan,
      toBlock: scanTo,
      topics: [[depositTopic, erc20DepositTopic, finalizedTopic, erc20FinalizedTopic]]
    });
    metrics.l2LogsSeen += logs.length;

    for (const log of logs) {
      const topic0 = log.topics[0] ?? "";
      if (topic0 === depositTopic || topic0 === erc20DepositTopic) await handleDepositLog(log);
      else await handleFinalizedLog(log);
    }

    // Attempt a few pending finalizations each pass (policy gated in-contract).
    if (l2Signer && pendingByKey.size > 0) {
      const maxPerTick = 3;
      let i = 0;
      for (const p of pendingByKey.values()) {
        await tryFinalizeOne(p);
        i += 1;
        if (i >= maxPerTick) break;
      }
    }

    nextL2BlockToScan = scanTo + 1;
    await saveCursor("l2", { nextBlockToScan: nextL2BlockToScan });
    await savePendingLocked();
  } catch (e) {
    console.error("[Relayer] Poll failed:", e);
    pushLog("error", "[Relayer] Poll failed", { error: String(e) });
    metrics.errors += 1;
  } finally {
    pollL2InFlight = false;
  }
}

try {
  const cursor = await loadCursor("l2");
  if (cursor.nextBlockToScan != null) nextL2BlockToScan = cursor.nextBlockToScan;
} catch (e) {
  console.error("[Relayer] Failed to load cursor:", e);
}

try {
  const cursor = await loadCursor("l3");
  if (cursor.nextBlockToScan != null) nextL3BlockToScan = cursor.nextBlockToScan;
} catch (e) {
  console.error("[Relayer] Failed to load cursor:", e);
}

try {
  await loadPending();
} catch (e) {
  console.error("[Relayer] Failed to load pending:", e);
}

async function pollL3Once() {
  if (pollL3InFlight) return;
  pollL3InFlight = true;
  try {
    metrics.l3Polls += 1;
    const latest = await l3Provider.getBlockNumber();
    const scanTo = Math.max(0, latest - CONFIRMATIONS);
    if (nextL3BlockToScan == null) {
      const lookback = 100;
      const defaultStart = Math.max(0, scanTo - lookback);
      nextL3BlockToScan =
        START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
    } else if (nextL3BlockToScan > latest + 500) {
      const lookback = 100;
      const defaultStart = Math.max(0, scanTo - lookback);
      const resetTo =
        START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
      const msg = `[Relayer] L3 cursor ahead of head; resetting nextBlockToScan=${nextL3BlockToScan} -> ${resetTo} (latest=${latest})`;
      console.warn(msg);
      pushLog("warn", msg, { latest, scanTo, resetTo, nextL3BlockToScan });
      nextL3BlockToScan = resetTo;
      await saveCursor("l3", { nextBlockToScan: nextL3BlockToScan });
    }
    if (nextL3BlockToScan > scanTo) return;

    const logs = await l3Provider.getLogs({
      fromBlock: nextL3BlockToScan,
      toBlock: scanTo,
      topics: [burnTopic]
    });
    metrics.l3LogsSeen += logs.length;

    let pendingTouched = false;
    for (const log of logs) {
      pendingTouched = (await handleBurnLog(log)) || pendingTouched;
    }
    if (pendingTouched) {
      // Persist pending burns before advancing the cursor (so rollup gating never drops withdrawals).
      await savePendingLocked();
    }

    nextL3BlockToScan = scanTo + 1;
    await saveCursor("l3", { nextBlockToScan: nextL3BlockToScan });
  } catch (e) {
    console.error("[Relayer] L3 poll failed:", e);
    pushLog("error", "[Relayer] L3 poll failed", { error: String(e) });
    metrics.errors += 1;
  } finally {
    pollL3InFlight = false;
  }
}

pollL2Once();
pollL3Once();
setInterval(pollL2Once, 2000);
setInterval(pollL3Once, 2000);

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const l1ChainId = l1Provider ? await l1Provider.send("eth_chainId", []) : null;
    const l2ChainId = await l2Provider.send("eth_chainId", []);
    const l3ChainId = await l3Provider.send("eth_chainId", []);
    res.json({
      ok: true,
      observeOnly,
      l1ChainId,
      l2ChainId,
      l3ChainId,
      confirmations: CONFIRMATIONS,
      bridge: BRIDGE,
      rollupGating: {
        l2FinalityOnL1: REQUIRE_L2_FINALITY_ON_L1 && Boolean(l1Rollup),
        l3FinalityOnL2: REQUIRE_L3_FINALITY_ON_L2 && Boolean(l2Rollup),
        l1RollupL2: L1_ROLLUP_L2 || null,
        l2RollupL3: L2_ROLLUP_L3 || null
      },
      inbox: L3_INBOX,
      l3TokenFactory: L3_TOKEN_FACTORY,
      hasL2Signer: Boolean(l2Signer),
      pendingFinalizations: pendingByKey.size,
      lastSeen,
      lastRelayed
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.get("/logs", async (_req, res) => {
  res.json({ ok: true, logs: logBuffer.slice(-200) });
});

app.get("/metrics", async (_req, res) => {
  res.json({ ok: true, ...metrics, observeOnly, hasL2Signer: Boolean(l2Signer), confirmations: CONFIRMATIONS });
});

function promLine(name: string, value: number | string, labels?: Record<string, string>) {
  const l = labels
    ? `{${Object.entries(labels)
        .map(([k, v]) => `${k}=\"${String(v).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}\"`)
        .join(",")}}`
    : "";
  return `${name}${l} ${value}\n`;
}

app.get("/metrics/prom", async (_req, res) => {
  res.type("text/plain; version=0.0.4");
  let out = "";
  out += promLine("ghost_relayer_up", 1);
  out += promLine("ghost_relayer_observe_only", observeOnly ? 1 : 0);
  out += promLine("ghost_relayer_has_l2_signer", l2Signer ? 1 : 0);
  out += promLine("ghost_relayer_pending_finalizations", pendingByKey.size);
  out += promLine("ghost_relayer_l2_polls_total", metrics.l2Polls);
  out += promLine("ghost_relayer_l3_polls_total", metrics.l3Polls);
  out += promLine("ghost_relayer_l2_logs_seen_total", metrics.l2LogsSeen);
  out += promLine("ghost_relayer_l3_logs_seen_total", metrics.l3LogsSeen);
  out += promLine("ghost_relayer_deposits_seen_total", metrics.depositsSeen);
  out += promLine("ghost_relayer_erc20_deposits_seen_total", metrics.erc20DepositsSeen);
  out += promLine("ghost_relayer_finalize_attempts_total", metrics.finalizeAttempts);
  out += promLine("ghost_relayer_finalize_success_total", metrics.finalizeSuccess);
  out += promLine("ghost_relayer_relayed_to_l3_total", metrics.relayedToL3);
  out += promLine("ghost_relayer_released_to_l2_total", metrics.releasedToL2);
  out += promLine("ghost_relayer_errors_total", metrics.errors);
  out += promLine("ghost_relayer_rollup_gating_enabled", 1, {
    l2_on_l1: l1Rollup ? "1" : "0",
    l3_on_l2: l2Rollup ? "1" : "0"
  });
  res.send(out);
});

app.listen(PORT, () => console.log(`Ghost Relayer listening on :${PORT}`));
