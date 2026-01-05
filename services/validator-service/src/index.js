import express from "express";
import { ethers } from "ethers";

const PORT = Number(process.env.PORT || 7600);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const RPC_L2 = process.env.RPC_L2 || "http://localhost:9545";
const RPC_L3 = process.env.RPC_L3 || "http://localhost:10545";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`prom status ${resp.status}`);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const jsonRpc = async (url, method, params = []) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`rpc status ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "rpc error");
    return body.result;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

const fetchValidatorsRpc = async (rpc) => {
  if (!rpc) return [];
  const vals = await jsonRpc(rpc, "ibft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
  if (Array.isArray(vals) && vals.length) return vals;
  const qbftVals = await jsonRpc(rpc, "qbft_getValidatorsByBlockNumber", ["latest"]).catch(() => null);
  return Array.isArray(qbftVals) ? qbftVals : [];
};

const collectProposers = async (rpc, window = 32) => {
  if (!rpc) return { counts: {}, total: 0 };
  const counts = {};
  try {
    const latestHex = await jsonRpc(rpc, "eth_blockNumber");
    const latest = latestHex ? parseInt(latestHex, 16) : 0;
    const start = Math.max(0, latest - window + 1);
    for (let n = start; n <= latest; n++) {
      const blk = await jsonRpc(rpc, "eth_getBlockByNumber", [`0x${n.toString(16)}`, false]);
      const author = blk?.miner || blk?.author;
      if (!author) continue;
      const id = author.toLowerCase();
      counts[id] = (counts[id] || 0) + 1;
    }
    return { counts, total: latest - start + 1 };
  } catch {
    return { counts: {}, total: 0 };
  }
};

const loadFromProm = async () => {
  const queries = {
    stake: "validator_stake_tokens",
    commission: "validator_commission_rate",
    missedBlocks: "validator_missed_blocks_total",
    proposerIndex: "validator_proposer_rank",
    byzantine: "byzantine_alerts_total"
  };
  const metrics = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      try {
        const resp = await promQuery(q);
        metrics[key] = resp?.data?.result || [];
      } catch {
        metrics[key] = [];
      }
    })
  );
  const map = {};
  Object.entries(metrics).forEach(([key, series]) => {
    series.forEach((s) => {
      const id = s.metric.validator || s.metric.pubkey || s.metric.address || "unknown";
      if (!map[id]) map[id] = { id };
      map[id][key] = s.value?.[1] || s.value;
    });
  });
  return map;
};

const mergeRpcFallback = async (map) => {
  const layers = [RPC_L2, RPC_L3];
  for (const rpc of layers) {
    const vals = await fetchValidatorsRpc(rpc).catch(() => []);
    const proposerStats = await collectProposers(rpc, 32);
    vals.forEach((v, idx) => {
      const id = String(v).toLowerCase();
      if (!map[id]) map[id] = { id };
      map[id].proposerIndex = map[id].proposerIndex ?? idx;
      if (proposerStats.counts && proposerStats.counts[id] !== undefined) {
        map[id].proposerIndex = `${proposerStats.counts[id]}/${proposerStats.total || "?"}`;
      }
      map[id].stake = map[id].stake ?? "0";
      map[id].commission = map[id].commission ?? "0";
      map[id].byzantine = map[id].byzantine ?? "0";
      map[id].missedBlocks = map[id].missedBlocks ?? "?";
    });
  }
  return map;
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "validator-service" });
});

app.get("/validators", async (_req, res) => {
  try {
    let map = await loadFromProm();
    map = await mergeRpcFallback(map);
    const validators = Object.values(map).map((v) => {
      const stakeNum = Number(v.stake || 0);
      return {
        id: v.id,
        address: v.id,
        status: "active",
        stake: v.stake ?? "0",
        commission: v.commission ?? "0",
        power: Number.isFinite(stakeNum) ? stakeNum : 0,
        proposerIndex: v.proposerIndex ?? "?",
        missedBlocks: v.missedBlocks ?? "?",
        byzantine: v.byzantine ?? "0"
      };
    });
    res.json({ ok: true, validators });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`[validator-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
