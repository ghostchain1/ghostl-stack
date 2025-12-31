import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.PORT || "7171");
const RPC_L2 = process.env.RPC_L2!;
const RPC_L3 = process.env.RPC_L3!;
const BRIDGE = process.env.BRIDGE_L2L3_ADDRESS!;
const L3_INBOX = process.env.L3_INBOX_ADDRESS!;
const L3_TOKEN_FACTORY = process.env.L3_TOKEN_FACTORY_ADDRESS!;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || "";
const L2_RELAYER_PRIVATE_KEY = process.env.L2_RELAYER_PRIVATE_KEY || "";
const STATE_DIR = process.env.STATE_DIR || "/state";
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "0");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;

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

const observeOnly = !RELAYER_PRIVATE_KEY;
const l3Signer = observeOnly ? null : new ethers.NonceManager(new ethers.Wallet(RELAYER_PRIVATE_KEY, l3Provider));
const l2Key = L2_RELAYER_PRIVATE_KEY || RELAYER_PRIVATE_KEY;
const l2Signer = l2Key ? new ethers.NonceManager(new ethers.Wallet(l2Key, l2Provider)) : null;
const inbox = new ethers.Contract(L3_INBOX, inboxAbi, l3Signer ?? l3Provider);
const l3Factory = new ethers.Contract(L3_TOKEN_FACTORY, l3FactoryAbi, l3Signer ?? l3Provider);

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
  finalizeAttempts: 0,
  finalizeSuccess: 0,
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

type PendingFinalize =
  | {
      kind: "DepositInitiated";
      key: string;
      from: string;
      to: string;
      amount: string;
      nonce: string;
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
      firstSeen: number;
      lastAttempt: number | null;
      attempts: number;
    };

const pendingByKey = new Map<string, PendingFinalize>();
const pendingPath = path.join(STATE_DIR, "pending.json");

async function loadPending() {
  try {
    const raw = await fs.readFile(pendingPath, "utf8");
    const parsed = JSON.parse(raw) as { pending?: Array<PendingFinalize> };
    for (const p of parsed.pending ?? []) {
      if (p && typeof p.key === "string" && p.key.startsWith("0x")) pendingByKey.set(p.key, p);
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

function scrubEthersError(e: any): string {
  return String(e?.shortMessage ?? e?.reason ?? e?.message ?? e);
}

async function handleFinalizedLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (parsed.name === "Finalized") {
    metrics.finalizedSeen += 1;
    const from = parsed.args[0] as string;
    const to = parsed.args[1] as string;
    const amount = parsed.args[2] as bigint;
    const nonce = parsed.args[3] as bigint;

    const key = msgKeyEth(from, to, amount, nonce);
    lastSeen = { kind: "Finalized", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };
    pendingByKey.delete(key);

    if (observeOnly) {
      const msg = `[Relayer] Observe-only saw Finalized key=${key} l2Tx=${log.transactionHash}`;
      console.log(msg);
      pushLog("info", msg);
      return;
    }

    const already = await inbox.processed(key);
    if (already) return;

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
    pendingByKey.delete(key);

    if (observeOnly) {
      const msg = `[Relayer] Observe-only saw ERC20Finalized key=${key} l2Tx=${log.transactionHash}`;
      console.log(msg);
      pushLog("info", msg, { token });
      return;
    }

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
          .map((l) => {
            try {
              return l3Factory.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((e) => e?.name === "BridgedTokenDeployed");
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
  if (p.lastAttempt && now - p.lastAttempt < 1500) return;

  try {
    metrics.finalizeAttempts += 1;
    if (p.kind === "DepositInitiated") {
      const k = msgKeyEth(p.from, p.to, BigInt(p.amount), BigInt(p.nonce));
      const t = (await l2Bridge.depositTime(k)) as bigint;
      if (t === 0n) {
        pendingByKey.delete(p.key);
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
      pendingByKey.delete(p.key);
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
    const msg = `[Relayer] Finalize blocked key=${p.key} err=${scrubEthersError(e)}`;
    pushLog("warn", msg);
  }
}

async function handleDepositLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (parsed.name === "DepositInitiated") {
    metrics.depositsSeen += 1;
    const from = parsed.args[0] as string;
    const to = parsed.args[1] as string;
    const amount = parsed.args[2] as bigint;
    const nonce = parsed.args[3] as bigint;
    const key = msgKeyEth(from, to, amount, nonce);

    lastSeen = { kind: "DepositInitiated", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    if (!pendingByKey.has(key)) {
      pendingByKey.set(key, {
        kind: "DepositInitiated",
        key,
        from,
        to,
        amount: amount.toString(),
        nonce: nonce.toString(),
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

    lastSeen = { kind: "ERC20DepositInitiated", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    if (!pendingByKey.has(key)) {
      pendingByKey.set(key, {
        kind: "ERC20DepositInitiated",
        key,
        token,
        from,
        to,
        amount: amount.toString(),
        nonce: nonce.toString(),
        firstSeen: Date.now(),
        lastAttempt: null,
        attempts: 0
      });
    }
  }
}

async function handleBurnLog(log: ethers.Log) {
  const parsed = l3TokenIface.parseLog(log);
  metrics.burnsSeen += 1;
  const l2Token = parsed.args[0] as string;
  const from = parsed.args[1] as string;
  const to = parsed.args[2] as string;
  const amount = parsed.args[3] as bigint;
  const nonce = parsed.args[4] as bigint;
  const key = parsed.args[5] as string;

  lastSeen = { kind: "BurnInitiated", l2Token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l3Tx: log.transactionHash };

  if (!l2Signer) {
    const msg = `[Relayer] Observe-only (missing L2 signer key) saw BurnInitiated key=${key} l3Tx=${log.transactionHash}`;
    console.log(msg);
    pushLog("warn", msg, { l2Token });
    return;
  }

  const expectedL3Token = (await l3Factory.l3TokenForL2Token(l2Token)) as string;
  if (!expectedL3Token || expectedL3Token === ethers.ZeroAddress) return;
  if (ethers.getAddress(expectedL3Token) !== ethers.getAddress(log.address)) return;

  const already = await l2Bridge.erc20WithdrawProcessed(msgKeyErc20(l2Token, from, to, amount, nonce));
  if (already) return;

  const tx = await l2Bridge.releaseERC20FromL3(l2Token, from, to, amount, nonce);
  await tx.wait();

  lastRelayed = { kind: "ERC20WithdrawReleased", l2Token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l3Tx: log.transactionHash, l2Tx: tx.hash };
  metrics.releasedToL2 += 1;
  const msg = `[Relayer] Released ERC20 to L2 key=${key} l3Tx=${log.transactionHash} l2Tx=${tx.hash}`;
  console.log(msg);
  pushLog("info", msg, lastRelayed);
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
      nextL2BlockToScan = START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
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
    await savePending();
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
      nextL3BlockToScan = START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
    }
    if (nextL3BlockToScan > scanTo) return;

    const logs = await l3Provider.getLogs({
      fromBlock: nextL3BlockToScan,
      toBlock: scanTo,
      topics: [burnTopic]
    });
    metrics.l3LogsSeen += logs.length;

    for (const log of logs) {
      await handleBurnLog(log);
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
    const l2ChainId = await l2Provider.send("eth_chainId", []);
    const l3ChainId = await l3Provider.send("eth_chainId", []);
    res.json({
      ok: true,
      observeOnly,
      l2ChainId,
      l3ChainId,
      confirmations: CONFIRMATIONS,
      bridge: BRIDGE,
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

app.listen(PORT, () => console.log(`Ghost Relayer listening on :${PORT}`));
