import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7635);
const RPC_L2 = process.env.RPC_L2 || "http://localhost:9545";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:10545";

const app = express();
app.use(express.json());

const fetchConsensus = async (rpc) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const latest = await provider.getBlock("latest");
    const prev = await provider.getBlock(latest.number - 1);
    const blockTime =
      latest && prev ? Math.max(0, Number(latest.timestamp) - Number(prev.timestamp || latest.timestamp)) : null;
    return {
      chainId: await provider.send("eth_chainId", []),
      block: latest?.number,
      blockTime,
      timestamp: latest?.timestamp,
      finalized: latest?.number // placeholder: using latest as finalized
    };
  } catch (e) {
    return { error: e?.message || "unreachable" };
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "consensus-telemetry-service" }));

app.get("/consensus", async (_req, res) => {
  try {
    const [l2, l3] = await Promise.all([fetchConsensus(RPC_L2), fetchConsensus(RPC_L3)]);
    res.json({ ok: true, consensus: { l2, l3 } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[consensus-telemetry-service] listening on :${PORT}`);
});
