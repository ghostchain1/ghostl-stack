import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7608);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const RPC_L2 = process.env.RPC_L2 || "http://localhost:9545";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:10545";

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

const fetchContractsProm = async () => {
  const resp = await promQuery("contracts_registry_total");
  const result = resp?.data?.result || [];
  return result.map((r) => ({
    address: r.metric.address || r.metric.contract || "unknown",
    name: r.metric.name || "contract",
    verified: r.metric.verified === "true" || false,
    proxyType: r.metric.proxy || null,
    owner: r.metric.owner || null
  }));
};

const codeAt = async (rpc, addr) => {
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const code = await provider.getCode(addr);
    return code && code !== "0x" ? code : null;
  } catch {
    return null;
  }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "contract-registry-service" }));

app.get("/contracts", async (_req, res) => {
  try {
    const promContracts = await fetchContractsProm();
    const addrs = promContracts.map((c) => c.address).filter(Boolean).slice(0, 20);
    const codes = await Promise.all(
      addrs.map(async (addr) => ({
        address: addr,
        l2: await codeAt(RPC_L2, addr),
        l3: await codeAt(RPC_L3, addr)
      }))
    );
    const merged = promContracts.map((c) => {
      const codeInfo = codes.find((x) => x.address?.toLowerCase() === c.address?.toLowerCase());
      return { ...c, hasCodeL2: Boolean(codeInfo?.l2), hasCodeL3: Boolean(codeInfo?.l3) };
    });
    res.json({ ok: true, contracts: merged });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[contract-registry-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
