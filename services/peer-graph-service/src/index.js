import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7636);
const RPC_L2 = process.env.RPC_L2 || "http://localhost:9545";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:10545";

const app = express();
app.use(express.json());

const fetchPeers = async (rpc) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const peersHex = await provider.send("net_peerCount", []);
    return { rpc, peers: parseInt(peersHex, 16) };
  } catch (e) {
    return { rpc, error: e?.message || "unreachable" };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "peer-graph-service" }));

app.get("/peers", async (_req, res) => {
  const [l2, l3] = await Promise.all([fetchPeers(RPC_L2), fetchPeers(RPC_L3)]);
  res.json({ ok: true, peers: { l2, l3 } });
});

app.listen(PORT, () => {
  console.log(`[peer-graph-service] listening on :${PORT}`);
});
