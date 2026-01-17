import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7633);
const RPC_L2 = process.env.RPC_L2 || "http://localhost:18547";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:39545";
const ENV = process.env.NET_ENV || "dev";

const app = express();
app.use(express.json());

const fetchChain = async (rpc) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const chainId = await provider.send("eth_chainId", []);
    const latest = await provider.getBlock("latest");
    return { rpc, chainId, block: latest?.number, hash: latest?.hash };
  } catch {
    return { rpc, error: "unreachable" };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "network-context-service" }));

app.get("/context", async (_req, res) => {
  const [l2, l3] = await Promise.all([fetchChain(RPC_L2), fetchChain(RPC_L3)]);
  res.json({ ok: true, env: ENV, networks: { l2, l3 } });
});

app.listen(PORT, () => {
  console.log(`[network-context-service] listening on :${PORT}`);
});
