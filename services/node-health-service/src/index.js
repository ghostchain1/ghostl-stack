import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7613);
const RPC_L2 = process.env.RPC_L2 || "http://localhost:18547";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:39545";

const app = express();
app.use(express.json());

const fetchNode = async (rpc) => {
  const provider = new ethers.JsonRpcProvider(rpc);
  const peersHex = await provider.send("net_peerCount", []);
  const syncing = await provider.send("eth_syncing", []);
  const block = await provider.getBlock("latest");
  return {
    rpc,
    peers: parseInt(peersHex, 16),
    syncing: syncing && typeof syncing === "object",
    block: block?.number,
    lagSeconds: block?.timestamp ? Math.max(0, Math.floor(Date.now() / 1000 - Number(block.timestamp))) : null
  };
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-health-service" }));

app.get("/nodes", async (_req, res) => {
  try {
    const [l2, l3] = await Promise.all([fetchNode(RPC_L2), fetchNode(RPC_L3)]);
    res.json({ ok: true, nodes: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[node-health-service] listening on :${PORT}`);
});
