import "dotenv/config";
import express from "express";
import { ethers } from "ethers";
import { computeRiskScore } from "./riskEngine.ts";

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

if (!RPC_L2 || !BRIDGE || !POLICY) {
  console.error("Missing env: RPC_L2, BRIDGE_L2L3_ADDRESS, GUARD_POLICY_ADDRESS");
  process.exit(1);
}

const bridgeAbi = [
  "event DepositInitiated(address indexed from, address indexed to, uint256 amount, uint256 nonce)"
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

const depositTopic = ethers.id("DepositInitiated(address,address,uint256,uint256)");
const bridgeIface = new ethers.Interface(bridgeAbi);

let nextBlockToScan: number | null = null;
let pollInFlight = false;
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

async function handleDepositLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  const from = parsed.args[0] as string;
  const to = parsed.args[1] as string;
  const amount = parsed.args[2] as bigint;
  const nonce = parsed.args[3] as bigint;

  lastEvent = { from, to, amount: amount.toString(), nonce: nonce.toString(), tx: log.transactionHash };

  const risk = computeRiskScore({ actor: from, amountWei: amount, nonce });
  console.log(`[Guard] DepositInitiated from=${from} amountWei=${amount} nonce=${nonce} risk=${risk}`);

  if (!signer) {
    console.log("[Guard] No PRIVATE_KEY set; running in observe-only mode.");
    return;
  }

  try {
    const tx1 = await policy.setRiskScore(from, risk);
    await tx1.wait();

    if (risk >= 80) {
      const tx2 = await policy.setMode(2); // PAUSE
      await tx2.wait();
      console.log("[Guard] High risk => policy paused.");
    }
  } catch (e) {
    console.error("[Guard] Failed to write policy:", e);
  }
}

async function pollBridgeOnce() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
  const latest = await provider.getBlockNumber();
  if (nextBlockToScan == null) {
    const lookback = 100;
    const defaultStart = Math.max(0, latest - lookback);
    nextBlockToScan = START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
  }
  if (nextBlockToScan > latest) return;

  const logs = await provider.getLogs({
    address: BRIDGE,
    fromBlock: nextBlockToScan,
    toBlock: latest,
    topics: [depositTopic]
  });

  for (const log of logs) {
    await handleDepositLog(log);
  }

  nextBlockToScan = latest + 1;
  } finally {
    pollInFlight = false;
  }
}

pollBridgeOnce().catch((e) => console.error("[Guard] Initial poll failed:", e));
setInterval(() => pollBridgeOnce().catch((e) => console.error("[Guard] Poll failed:", e)), 2000);

const app = express();
app.use(express.json());

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
      lastEvent
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

// manual controls (requires PRIVATE_KEY)
app.post("/policy/mode", async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const m = Number(req.body?.mode);
  if (![0, 1, 2].includes(m)) return res.status(400).json({ ok: false, error: "mode must be 0/1/2" });
  const tx = await policy.setMode(m);
  await tx.wait();
  res.json({ ok: true, mode: m });
});

app.post("/policy/threshold", async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const t = Number(req.body?.threshold);
  if (!Number.isFinite(t) || t < 0 || t > 100) {
    return res.status(400).json({ ok: false, error: "threshold must be 0..100" });
  }
  const tx = await policy.setRiskThreshold(Math.floor(t));
  await tx.wait();
  res.json({ ok: true, riskThreshold: Math.floor(t) });
});

app.post("/policy/delay", async (req, res) => {
  if (!signer) return res.status(400).json({ ok: false, error: "PRIVATE_KEY missing" });
  const s = Number(req.body?.seconds);
  if (!Number.isFinite(s) || s < 0) {
    return res.status(400).json({ ok: false, error: "seconds must be >= 0" });
  }
  const tx = await policy.setDelaySeconds(Math.floor(s));
  await tx.wait();
  res.json({ ok: true, delaySeconds: Math.floor(s) });
});

app.post("/policy/risk", async (req, res) => {
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
