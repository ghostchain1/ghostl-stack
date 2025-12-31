import "dotenv/config";
import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || "7171");
const RPC_L2 = process.env.RPC_L2!;
const RPC_L3 = process.env.RPC_L3!;
const BRIDGE = process.env.BRIDGE_L2L3_ADDRESS!;
const L3_INBOX = process.env.L3_INBOX_ADDRESS!;
const L3_TOKEN = process.env.L3_TOKEN_ADDRESS!;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY || "";

if (!RPC_L2 || !RPC_L3 || !BRIDGE || !L3_INBOX || !L3_TOKEN) {
  console.error("Missing env: RPC_L2, RPC_L3, BRIDGE_L2L3_ADDRESS, L3_INBOX_ADDRESS, L3_TOKEN_ADDRESS");
  process.exit(1);
}

const bridgeAbi = [
  "event Finalized(address indexed from, address indexed to, uint256 amount, uint256 nonce)",
  "event ERC20Finalized(address indexed token, address indexed from, address indexed to, uint256 amount, uint256 nonce)"
];

const inboxAbi = [
  "function finalizeFromL2(address from, address to, uint256 amount, uint256 nonce) external",
  "function processed(bytes32 key) view returns (bool)"
];

const finalizedTopic = ethers.id("Finalized(address,address,uint256,uint256)");
const erc20FinalizedTopic = ethers.id("ERC20Finalized(address,address,address,uint256,uint256)");
const bridgeIface = new ethers.Interface(bridgeAbi);

const l3TokenAbi = [
  "function mintFromL2(address from, address to, uint256 amount, uint256 nonce) external",
  "function processed(bytes32 key) view returns (bool)"
];

const l2Provider = new ethers.JsonRpcProvider(RPC_L2, undefined, { polling: true });
l2Provider.pollingInterval = 1000;

const l3Provider = new ethers.JsonRpcProvider(RPC_L3, undefined, { polling: true });
l3Provider.pollingInterval = 1000;

const observeOnly = !RELAYER_PRIVATE_KEY;
const l3Signer = observeOnly ? null : new ethers.NonceManager(new ethers.Wallet(RELAYER_PRIVATE_KEY, l3Provider));
const inbox = new ethers.Contract(L3_INBOX, inboxAbi, l3Signer ?? l3Provider);
const l3Token = new ethers.Contract(L3_TOKEN, l3TokenAbi, l3Signer ?? l3Provider);

let nextBlockToScan: number | null = null;
let pollInFlight = false;
let lastRelayed: any = null;
let lastSeen: any = null;
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;

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

async function handleFinalizedLog(log: ethers.Log) {
  const parsed = bridgeIface.parseLog(log);
  if (parsed.name === "Finalized") {
    const from = parsed.args[0] as string;
    const to = parsed.args[1] as string;
    const amount = parsed.args[2] as bigint;
    const nonce = parsed.args[3] as bigint;

    const key = msgKeyEth(from, to, amount, nonce);
    lastSeen = { kind: "Finalized", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    if (observeOnly) {
      console.log(`[Relayer] Observe-only saw Finalized key=${key} l2Tx=${log.transactionHash}`);
      return;
    }

    const already = await inbox.processed(key);
    if (already) return;

    const tx = await inbox.finalizeFromL2(from, to, amount, nonce);
    await tx.wait();

    lastRelayed = { kind: "Finalized", from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash, l3Tx: tx.hash };
    console.log(`[Relayer] Relayed Finalized key=${key} l2Tx=${log.transactionHash} l3Tx=${tx.hash}`);
    return;
  }

  if (parsed.name === "ERC20Finalized") {
    const token = parsed.args[0] as string;
    const from = parsed.args[1] as string;
    const to = parsed.args[2] as string;
    const amount = parsed.args[3] as bigint;
    const nonce = parsed.args[4] as bigint;

    const key = msgKeyErc20(token, from, to, amount, nonce);
    lastSeen = { kind: "ERC20Finalized", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash };

    if (observeOnly) {
      console.log(`[Relayer] Observe-only saw ERC20Finalized key=${key} l2Tx=${log.transactionHash}`);
      return;
    }

    // The L3 token enforces idempotency via its `processed` mapping.
    const tx = await l3Token.mintFromL2(from, to, amount, nonce);
    await tx.wait();

    lastRelayed = { kind: "ERC20Finalized", token, from, to, amount: amount.toString(), nonce: nonce.toString(), key, l2Tx: log.transactionHash, l3Tx: tx.hash };
    console.log(`[Relayer] Relayed ERC20Finalized key=${key} l2Tx=${log.transactionHash} l3Tx=${tx.hash}`);
  }
}

async function pollOnce() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const latest = await l2Provider.getBlockNumber();
    if (nextBlockToScan == null) {
      const lookback = 100;
      const defaultStart = Math.max(0, latest - lookback);
      nextBlockToScan = START_BLOCK != null && Number.isFinite(START_BLOCK) ? Math.max(0, Math.floor(START_BLOCK)) : defaultStart;
    }
    if (nextBlockToScan > latest) return;

    const logs = await l2Provider.getLogs({
      address: BRIDGE,
      fromBlock: nextBlockToScan,
      toBlock: latest,
      topics: [[finalizedTopic, erc20FinalizedTopic]]
    });

    for (const log of logs) {
      await handleFinalizedLog(log);
    }

    nextBlockToScan = latest + 1;
  } catch (e) {
    console.error("[Relayer] Poll failed:", e);
  } finally {
    pollInFlight = false;
  }
}

pollOnce();
setInterval(pollOnce, 2000);

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
      bridge: BRIDGE,
      inbox: L3_INBOX,
      l3Token: L3_TOKEN,
      lastSeen,
      lastRelayed
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

app.listen(PORT, () => console.log(`Ghost Relayer listening on :${PORT}`));
