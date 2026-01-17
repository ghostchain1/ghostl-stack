import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7612);
const RPC_L2 = process.env.RPC_L2 || "http://localhost:18547";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:39545";

const app = express();
app.use(express.json());

const fetchChain = async (rpc) => {
  const provider = new ethers.JsonRpcProvider(rpc);
  const latest = await provider.getBlock("latest");
  const prev = await provider.getBlock(latest.number - 1);
  const blockTime =
    latest && prev ? Math.max(0, Number(latest.timestamp) - Number(prev.timestamp || latest.timestamp)) : null;
  return {
    chainId: await provider.send("eth_chainId", []),
    block: latest?.number,
    hash: latest?.hash,
    blockTime,
    timestamp: latest?.timestamp
  };
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "chain-status-service" }));

app.get("/chains", async (_req, res) => {
  try {
    const [l2, l3] = await Promise.all([fetchChain(RPC_L2), fetchChain(RPC_L3)]);
    res.json({ ok: true, chains: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[chain-status-service] listening on :${PORT}`);
});
