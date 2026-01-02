import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import { computeRiskScore } from "./riskEngine.ts";
import { computeGraphRisk, createGraphState, recordGraphEdge } from "./graphRisk.ts";
import fs from "node:fs/promises";
import path from "node:path";

const jsonRpcProviderProto = (ethers.JsonRpcProvider as any).prototype;
if (!jsonRpcProviderProto.__ghostGuardPatched) {
  jsonRpcProviderProto.__ghostGuardPatched = true;
  const originalSend = jsonRpcProviderProto.send;
  jsonRpcProviderProto.send = async function (method: string, params: Array<any>) {
    const result = await originalSend.call(this, method, params);
    // Polygon Edge can return `null` for eth_getFilterChanges when there are no results;
    // ethers expects an array.
    if (method === "eth_getFilterChanges" && !Array.isArray(result)) return [];
    return result;
  };
}

const PORT = Number(process.env.PORT || "7070");
const RPC_L2 = process.env.RPC_L2!;
const BRIDGE = process.env.BRIDGE_L2L3_ADDRESS!;
const POLICY = process.env.GUARD_POLICY_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const ALLOW_INSECURE_ADMIN = process.env.ALLOW_INSECURE_ADMIN === "1";
const STATE_DIR = process.env.STATE_DIR || "/state";
const AUTO_PAUSE = process.env.AUTO_PAUSE !== "0";
const AUTO_ACTION = (process.env.AUTO_ACTION || "").toLowerCase(); // "pause" | "quarantine" | ""
const quarantineDelayRaw = Number(process.env.QUARANTINE_DELAY_SECONDS || "30");
const QUARANTINE_DELAY_SECONDS =
  Number.isFinite(quarantineDelayRaw) && quarantineDelayRaw >= 0 ? Math.floor(quarantineDelayRaw) : 30;
const quarantineThresholdRaw = Number(process.env.AUTO_QUARANTINE_THRESHOLD || "70");
const AUTO_QUARANTINE_THRESHOLD =
  Number.isFinite(quarantineThresholdRaw) && quarantineThresholdRaw >= 0 ? Math.floor(quarantineThresholdRaw) : 70;
const pauseThresholdRaw = Number(process.env.AUTO_PAUSE_THRESHOLD || "90");
const AUTO_PAUSE_THRESHOLD = Number.isFinite(pauseThresholdRaw) && pauseThresholdRaw >= 0 ? Math.floor(pauseThresholdRaw) : 90;
const riskWindowRaw = Number(process.env.RISK_WINDOW_SECONDS || "300");
const RISK_WINDOW_SECONDS =
  Number.isFinite(riskWindowRaw) && riskWindowRaw > 0 ? Math.floor(riskWindowRaw) : 300;
const confirmationsRaw = Number(process.env.CONFIRMATIONS || "0");
const CONFIRMATIONS = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 0 ? Math.floor(confirmationsRaw) : 0;
const graphWindowRaw = Number(process.env.GRAPH_WINDOW_SECONDS || "3600");
const GRAPH_WINDOW_SECONDS =
  Number.isFinite(graphWindowRaw) && graphWindowRaw > 0 ? Math.floor(graphWindowRaw) : 3600;

if (!RPC_L2 || !BRIDGE || !POLICY) {
  console.error("Missing env: RPC_L2, BRIDGE_L2L3_ADDRESS, GUARD_POLICY_ADDRESS");
  process.exit(1);
}

const bridgeAbi = [
  "event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce)",
  "event ERC20DepositInitiated(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)"
];

const policyAbi = [
  "function setMode(uint8 m) external",
  "function setDelaySeconds(uint256 s) external",
  "function setRiskThreshold(uint256 t) external",
  "function setRiskScore(address who, uint256 score) external",
  "function mode() view returns (uint8)",
  "function delaySeconds() view returns (uint256)",
  "function riskThreshold() view returns (uint256)",
  "function riskScore(address who) view returns (uint256)",
  "event RiskScoreSet(address indexed who, uint256 score)"
];

const provider = new ethers.JsonRpcProvider(RPC_L2, undefined, { polling: true });
provider.pollingInterval = 1000;

const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const signerWithNonce = signer ? new ethers.NonceManager(signer) : null;

const policy = new ethers.Contract(POLICY, policyAbi, signerWithNonce ?? provider);

let lastEvent: any = null;
const recentEvents: Array<any> = [];

type LogEntry = { ts: number; level: "info" | "warn" | "error"; msg: string; data?: any };
const logBuffer: Array<LogEntry> = [];
function pushLog(level: LogEntry["level"], msg: string, data?: any) {
  logBuffer.push({ ts: Date.now(), level, msg, data });
  while (logBuffer.length > 200) logBuffer.shift();
}

type Alert = {
  ts: number;
  kind: string;
  token: string | null;
  from: string;
  to: string;
  amountWei: string;
  nonce: string;
  tx: string;
  risk: number;
  velocityRisk: number;
  graphRisk: any;
  reasons: Array<string>;
  isAllowlisted: boolean;
  isBlocklisted: boolean;
};

const alerts: Array<Alert> = [];
const alertMinRiskRaw = Number(process.env.ALERT_MIN_RISK || "70");
const ALERT_MIN_RISK =
  Number.isFinite(alertMinRiskRaw) && alertMinRiskRaw >= 0 ? Math.floor(alertMinRiskRaw) : 70;
const alertsPath = path.join(STATE_DIR, "alerts.jsonl");

async function emitAlert(a: Alert) {
  alerts.push(a);
  while (alerts.length > 200) alerts.shift();
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.appendFile(alertsPath, JSON.stringify(a) + "\n", "utf8");
  } catch {
    // ignore
  }
}

const metrics = {
  startedAt: Date.now(),
  polls: 0,
  logsSeen: 0,
  depositsSeen: 0,
  policyWrites: 0,
  policyWriteErrors: 0,
  alerts: 0
};

const depositTopic = ethers.id("DepositInitiated(address,address,uint256,uint256)");
const erc20DepositTopic = ethers.id("ERC20DepositInitiated(address,address,address,uint256,uint256)");
const bridgeIface = new ethers.Interface(bridgeAbi);

let nextBlockToScan: number | null = null;
let pollInFlight = false;
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

type ListsState = { allowlist: Array<string>; blocklist: Array<string> };
const allowlist = new Set<string>();
const blocklist = new Set<string>();

const actorEvents = new Map<string, Array<{ ts: number; amountWei: bigint }>>();
const graph = createGraphState();
const firstSeen = new Map<string, number>();
const firstSeenPath = path.join(STATE_DIR, "first_seen.json");

async function loadFirstSeen() {
  try {
    const raw = await fs.readFile(firstSeenPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) firstSeen.set(ethers.getAddress(k), Math.floor(v));
    }
  } catch {
    // ignore
  }
}

async function saveFirstSeen() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const obj: Record<string, number> = {};
  for (const [k, v] of firstSeen) obj[k] = v;
  const tmp = `${firstSeenPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  await fs.rename(tmp, firstSeenPath);
}

async function loadLists() {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const p = path.join(STATE_DIR, "lists.json");
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Partial<ListsState>;
    for (const a of parsed.allowlist ?? []) allowlist.add(ethers.getAddress(a));
    for (const a of parsed.blocklist ?? []) blocklist.add(ethers.getAddress(a));
  } catch {
    // first run / no state
  }
}

async function saveLists() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const p = path.join(STATE_DIR, "lists.json");
  const state: ListsState = { allowlist: Array.from(allowlist), blocklist: Array.from(blocklist) };
  await fs.writeFile(p, JSON.stringify(state, null, 2) + "\n", "utf8");
}

type CursorState = { nextBlockToScan: number | null };
const cursorPath = path.join(STATE_DIR, "cursor.json");

async function loadCursor(): Promise<CursorState> {
  try {
    const raw = await fs.readFile(cursorPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CursorState>;
    const n = parsed.nextBlockToScan;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return { nextBlockToScan: Math.floor(n) };
  } catch {
    // ignore
  }
  return { nextBlockToScan: null };
}

async function saveCursor(state: CursorState) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const tmp = `${cursorPath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  await fs.rename(tmp, cursorPath);
}

function recordActorEvent(actor: string, amountWei: bigint) {
  const now = Date.now();
  const cutoff = now - Math.max(1, RISK_WINDOW_SECONDS) * 1000;
  const list = actorEvents.get(actor) ?? [];
  list.push({ ts: now, amountWei });
  while (list.length > 0 && list[0]!.ts < cutoff) list.shift();
  actorEvents.set(actor, list);

  let recentAmountWei = 0n;
  for (const e of list) recentAmountWei += e.amountWei;
  return { recentCount: list.length, recentAmountWei };
}

async function handleDepositLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (!parsed) return;
  const token = (parsed.name === "ERC20DepositInitiated" ? (parsed.args[0] as string) : null);
  const from = parsed.name === "ERC20DepositInitiated" ? (parsed.args[1] as string) : (parsed.args[0] as string);
  const to = parsed.name === "ERC20DepositInitiated" ? (parsed.args[2] as string) : (parsed.args[1] as string);
  const amount = parsed.name === "ERC20DepositInitiated" ? (parsed.args[3] as bigint) : (parsed.args[2] as bigint);
  const nonce = parsed.name === "ERC20DepositInitiated" ? (parsed.args[4] as bigint) : (parsed.args[3] as bigint);

  const { recentCount, recentAmountWei } = recordActorEvent(from, amount);

  recordGraphEdge(graph, from, to, Date.now(), GRAPH_WINDOW_SECONDS * 1000);

  const normalizedFrom = ethers.getAddress(from);
  const now = Date.now();
  if (!firstSeen.has(normalizedFrom)) {
    firstSeen.set(normalizedFrom, now);
    await saveFirstSeen();
  }
  const ageSeconds = Math.floor((now - (firstSeen.get(normalizedFrom) ?? now)) / 1000);

  const velocityRisk = computeRiskScore({
    actor: from,
    amountWei: amount,
    nonce,
    recentCount,
    recentAmountWei,
    ageSeconds
  });
  const graphRisk = computeGraphRisk({
    from,
    to,
    blocklist,
    windowMs: GRAPH_WINDOW_SECONDS * 1000,
    state: graph
  });

  let risk = Math.max(velocityRisk, graphRisk.score);

  const isAllowlisted = allowlist.has(normalizedFrom);
  const isBlocklisted = blocklist.has(normalizedFrom);
  if (isAllowlisted) risk = 0;
  if (isBlocklisted) risk = 100;

  lastEvent = {
    kind: parsed.name,
    token,
    from,
    to,
    amount: amount.toString(),
    nonce: nonce.toString(),
    tx: log.transactionHash,
    risk,
    velocityRisk,
    graphRisk,
    ageSeconds,
    recentCount,
    recentAmountWei: recentAmountWei.toString(),
    isAllowlisted,
    isBlocklisted
  };
  recentEvents.push({ ts: Date.now(), ...lastEvent });
  while (recentEvents.length > 50) recentEvents.shift();

  metrics.depositsSeen += 1;
  const msg = `[Guard] ${parsed.name} from=${from} amountWei=${amount} nonce=${nonce} risk=${risk} (velocity=${velocityRisk}, graph=${graphRisk.score})`;
  console.log(msg);
  pushLog("info", msg, lastEvent);

  const shouldAlert = !isAllowlisted && (isBlocklisted || risk >= ALERT_MIN_RISK || (graphRisk.reasons?.length ?? 0) > 0);
  if (shouldAlert) {
    metrics.alerts += 1;
    await emitAlert({
      ts: Date.now(),
      kind: parsed.name,
      token,
      from,
      to,
      amountWei: amount.toString(),
      nonce: nonce.toString(),
      tx: String(log.transactionHash ?? ""),
      risk,
      velocityRisk,
      graphRisk,
      reasons: Array.isArray(graphRisk.reasons) ? graphRisk.reasons : [],
      isAllowlisted,
      isBlocklisted
    });
  }

  if (!signer) {
    console.log("[Guard] No PRIVATE_KEY set; running in observe-only mode.");
    pushLog("warn", "[Guard] No PRIVATE_KEY set; running in observe-only mode.");
    return;
  }

  try {
    const tx1 = await policy.setRiskScore(from, risk);
    await tx1.wait();
    metrics.policyWrites += 1;

    // Automated response:
    // - default (legacy): AUTO_PAUSE pauses at risk>=80
    // - AUTO_ACTION=quarantine: set DELAY with QUARANTINE_DELAY_SECONDS above AUTO_QUARANTINE_THRESHOLD, PAUSE above AUTO_PAUSE_THRESHOLD
    // - AUTO_ACTION=pause: PAUSE above AUTO_PAUSE_THRESHOLD
    if (AUTO_ACTION === "quarantine") {
      if (risk >= AUTO_PAUSE_THRESHOLD) {
        const tx2 = await policy.setMode(2); // PAUSE
        await tx2.wait();
        console.log("[Guard] High risk => policy paused.");
        pushLog("warn", "[Guard] High risk => policy paused.", { risk });
      } else if (risk >= AUTO_QUARANTINE_THRESHOLD) {
        const txDelay = await policy.setDelaySeconds(QUARANTINE_DELAY_SECONDS);
        await txDelay.wait();
        const txMode = await policy.setMode(1); // DELAY
        await txMode.wait();
        console.log("[Guard] Elevated risk => policy delayed (quarantine).");
        pushLog("warn", "[Guard] Elevated risk => policy delayed (quarantine).", { risk, delaySeconds: QUARANTINE_DELAY_SECONDS });
      }
    } else if (AUTO_ACTION === "pause") {
      if (risk >= AUTO_PAUSE_THRESHOLD) {
        const tx2 = await policy.setMode(2); // PAUSE
        await tx2.wait();
        console.log("[Guard] High risk => policy paused.");
        pushLog("warn", "[Guard] High risk => policy paused.", { risk });
      }
    } else if (AUTO_PAUSE && risk >= 80) {
      // Legacy behavior
      const tx2 = await policy.setMode(2); // PAUSE
      await tx2.wait();
      console.log("[Guard] High risk => policy paused.");
      pushLog("warn", "[Guard] High risk => policy paused.", { risk });
    }
  } catch (e) {
    console.error("[Guard] Failed to write policy:", e);
    pushLog("error", "[Guard] Failed to write policy", { error: String(e) });
    metrics.policyWriteErrors += 1;
  }
}

async function pollBridgeOnce() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
  metrics.polls += 1;
  const latest = await provider.getBlockNumber();
  const scanTo = Math.max(0, latest - CONFIRMATIONS);
  if (nextBlockToScan == null) {
    const lookback = 100;
    const defaultStart = Math.max(0, scanTo - lookback);
    nextBlockToScan = START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
  }
  if (nextBlockToScan > scanTo) return;

  const logs = await provider.getLogs({
    address: BRIDGE,
    fromBlock: nextBlockToScan,
    toBlock: scanTo,
    topics: [[depositTopic, erc20DepositTopic]]
  });
  metrics.logsSeen += logs.length;

  for (const log of logs) {
    await handleDepositLog(log);
  }

  nextBlockToScan = scanTo + 1;
  await saveCursor({ nextBlockToScan });
  } finally {
    pollInFlight = false;
  }
}

try {
  await loadLists();
} catch (e) {
  console.error("[Guard] Failed to load lists:", e);
}

try {
  await loadFirstSeen();
} catch (e) {
  console.error("[Guard] Failed to load first_seen:", e);
}

try {
  const cursor = await loadCursor();
  if (cursor.nextBlockToScan != null) nextBlockToScan = cursor.nextBlockToScan;
} catch (e) {
  console.error("[Guard] Failed to load cursor:", e);
}

pollBridgeOnce().catch((e) => console.error("[Guard] Initial poll failed:", e));
setInterval(() => pollBridgeOnce().catch((e) => console.error("[Guard] Poll failed:", e)), 2000);

const app = express();
app.use(express.json());

app.use(express.static(new URL("../public", import.meta.url).pathname));

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_TOKEN && !ALLOW_INSECURE_ADMIN) {
    return res.status(403).json({ ok: false, error: "ADMIN_TOKEN not configured" });
  }
  if (!ADMIN_TOKEN && ALLOW_INSECURE_ADMIN) return next();
  const token = req.header("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

app.get("/proxy/relayer-health", async (_req, res) => {
  try {
    const url = process.env.RELAYER_HEALTH_URL || "http://ghost-relayer:7171/health";
    const r = await fetch(url);
    const txt = await r.text();
    res.status(r.status).type(r.headers.get("content-type") || "application/json").send(txt);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message ?? String(e) });
  }
});

async function proxyRelayer(pathname: string, res: express.Response) {
  const base = process.env.RELAYER_BASE_URL || "http://ghost-relayer:7171";
  const url = `${base}${pathname}`;
  const r = await fetch(url);
  const txt = await r.text();
  res.status(r.status).type(r.headers.get("content-type") || "application/json").send(txt);
}

app.get("/proxy/relayer-logs", async (_req, res) => {
  try {
    await proxyRelayer("/logs", res);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.get("/proxy/relayer-metrics", async (_req, res) => {
  try {
    await proxyRelayer("/metrics", res);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.get("/health", async (_req, res) => {
  try {
    const chainId = await provider.send("eth_chainId", []);
    const mode = await policy.mode();
    const delaySeconds = await policy.delaySeconds();
    const riskThreshold = await policy.riskThreshold();

    let lastActorRiskScore: number | null = null;
    if (lastEvent?.from) {
      const r = await policy.riskScore(lastEvent.from);
      lastActorRiskScore = Number(r);
    }

    res.json({
      ok: true,
      chainId,
      policyMode: Number(mode),
      delaySeconds: Number(delaySeconds),
      riskThreshold: Number(riskThreshold),
      lastActorRiskScore,
      autoPause: AUTO_PAUSE,
      riskWindowSeconds: RISK_WINDOW_SECONDS,
      graphWindowSeconds: GRAPH_WINDOW_SECONDS,
      confirmations: CONFIRMATIONS,
      hasPrivateKey: Boolean(PRIVATE_KEY),
      metrics,
      recentEvents: recentEvents.slice(-10),
      lastEvent
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.get("/events", async (_req, res) => {
  res.json({ ok: true, events: recentEvents.slice(-50) });
});

app.get("/alerts", async (_req, res) => {
  res.json({ ok: true, alerts: alerts.slice(-200), alertMinRisk: ALERT_MIN_RISK });
});

app.get("/logs", async (_req, res) => {
  res.json({ ok: true, logs: logBuffer.slice(-200) });
});

app.get("/metrics", async (_req, res) => {
  res.json({ ok: true, ...metrics, hasPrivateKey: Boolean(PRIVATE_KEY) });
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
  const up = 1;
  let out = "";
  out += promLine("ghost_guard_up", up);
  out += promLine("ghost_guard_polls_total", metrics.polls);
  out += promLine("ghost_guard_logs_seen_total", metrics.logsSeen);
  out += promLine("ghost_guard_deposits_seen_total", metrics.depositsSeen);
  out += promLine("ghost_guard_policy_writes_total", metrics.policyWrites);
  out += promLine("ghost_guard_policy_write_errors_total", metrics.policyWriteErrors);
  out += promLine("ghost_guard_alerts_total", metrics.alerts);
  out += promLine("ghost_guard_allowlist_size", allowlist.size);
  out += promLine("ghost_guard_blocklist_size", blocklist.size);
  out += promLine("ghost_guard_first_seen_entries", firstSeen.size);
  out += promLine("ghost_guard_auto_pause_enabled", AUTO_PAUSE ? 1 : 0);
  out += promLine("ghost_guard_auto_action", 1, { mode: AUTO_ACTION || "legacy" });
  out += promLine("ghost_guard_quarantine_delay_seconds", QUARANTINE_DELAY_SECONDS);
  out += promLine("ghost_guard_auto_quarantine_threshold", AUTO_QUARANTINE_THRESHOLD);
  out += promLine("ghost_guard_auto_pause_threshold", AUTO_PAUSE_THRESHOLD);
  res.send(out);
});

app.get("/lists", (_req, res) => {
  res.json({ ok: true, allowlist: Array.from(allowlist), blocklist: Array.from(blocklist) });
});

app.post("/lists/allow", requireAdmin, async (req, res) => {
  const addressRaw = String(req.body?.address ?? "");
  if (!ethers.isAddress(addressRaw)) return res.status(400).json({ ok: false, error: "address must be valid" });
  const address = ethers.getAddress(addressRaw);
  allowlist.add(address);
  blocklist.delete(address);
  await saveLists();
  res.json({ ok: true, address, allowlisted: true });
});

app.post("/lists/block", requireAdmin, async (req, res) => {
  const addressRaw = String(req.body?.address ?? "");
  if (!ethers.isAddress(addressRaw)) return res.status(400).json({ ok: false, error: "address must be valid" });
  const address = ethers.getAddress(addressRaw);
  blocklist.add(address);
  allowlist.delete(address);
  await saveLists();
  res.json({ ok: true, address, blocklisted: true });
});

app.post("/lists/remove", requireAdmin, async (req, res) => {
  const addressRaw = String(req.body?.address ?? "");
  if (!ethers.isAddress(addressRaw)) return res.status(400).json({ ok: false, error: "address must be valid" });
  const address = ethers.getAddress(addressRaw);
  allowlist.delete(address);
  blocklist.delete(address);
  await saveLists();
  res.json({ ok: true, address, removed: true });
});

// manual controls (requires PRIVATE_KEY)
app.post("/policy/mode", requireAdmin, async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const m = Number(req.body?.mode);
  if (![0, 1, 2].includes(m)) return res.status(400).json({ ok: false, error: "mode must be 0/1/2" });
  const tx = await policy.setMode(m);
  await tx.wait();
  res.json({ ok: true, mode: m });
});

app.post("/policy/threshold", requireAdmin, async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const t = Number(req.body?.threshold);
  if (!Number.isFinite(t) || t < 0 || t > 100) {
    return res.status(400).json({ ok: false, error: "threshold must be 0..100" });
  }
  const tx = await policy.setRiskThreshold(Math.floor(t));
  await tx.wait();
  res.json({ ok: true, riskThreshold: Math.floor(t) });
});

app.post("/policy/delay", requireAdmin, async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const s = Number(req.body?.seconds);
  if (!Number.isFinite(s) || s < 0) {
    return res.status(400).json({ ok: false, error: "seconds must be >= 0" });
  }
  const tx = await policy.setDelaySeconds(Math.floor(s));
  await tx.wait();
  res.json({ ok: true, delaySeconds: Math.floor(s) });
});

app.post("/policy/risk", requireAdmin, async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const who = String(req.body?.who ?? "");
  const score = Number(req.body?.score);
  if (!ethers.isAddress(who)) return res.status(400).json({ ok: false, error: "who must be an address" });
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return res.status(400).json({ ok: false, error: "score must be 0..100" });
  }
  const tx = await policy.setRiskScore(who, Math.floor(score));
  await tx.wait();
  res.json({ ok: true, who, score: Math.floor(score) });
});

app.listen(PORT, () => console.log(`Ghost Guard listening on :${PORT}`));
