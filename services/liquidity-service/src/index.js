import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7606);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const RPC_L2 = process.env.RPC_L2 || "http://localhost:18547";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:39545";
const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || "";
const L2_TOKEN = process.env.L2_TOKEN_ADDRESS || "";
const L3_TOKEN = process.env.L3_TOKEN_ADDRESS || "";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];

const erc20Balance = async (rpcUrl, token, account) => {
  if (!token || !account) return null;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const c = new ethers.Contract(token, erc20Abi, provider);
    const bal = await c.balanceOf(account);
    return bal.toString();
  } catch {
    return null;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "liquidity-service" }));

app.get("/liquidity", async (_req, res) => {
  try {
    const relayedResp = await promQuery("ghost_relayer_relayed_to_l3_total");
    const releasedResp = await promQuery("ghost_relayer_released_to_l2_total");
    const relayed = relayedResp?.data?.result?.[0]?.value?.[1] || "0";
    const released = releasedResp?.data?.result?.[0]?.value?.[1] || "0";

    const l2TokenBal = await erc20Balance(RPC_L2, L2_TOKEN, BRIDGE_ADDRESS);
    const l3TokenSupply = await erc20Balance(RPC_L3, L3_TOKEN, null);

    res.json({
      ok: true,
      pools: [
        { id: "l2-bridge", chain: "l2", token: L2_TOKEN, bridge: BRIDGE_ADDRESS, balance: l2TokenBal },
        { id: "l3-token", chain: "l3", token: L3_TOKEN, supply: l3TokenSupply }
      ],
      stats: { relayed, released }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[liquidity-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
