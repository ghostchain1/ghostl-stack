import express from "express";

const PORT = Number(process.env.PORT || 7645);
const DEFAULT_LAYER = (process.env.GOVERNANCE_LAYER || process.env.DEFAULT_LAYER || "L1").toUpperCase();
const layerValue = (value) => String(value || "").toUpperCase();
const normalizeLayer = (value) => {
  const raw = layerValue(value);
  if (raw === "1" || raw === "L1") return "L1";
  if (raw === "2" || raw === "L2") return "L2";
  if (raw === "3" || raw === "L3") return "L3";
  return "";
};

const layerConfigs = {
  L1: {
    rpc: process.env.GOVERNANCE_RPC_L1 || process.env.RPC_L1 || process.env.GOVERNANCE_RPC || "",
    governor: (process.env.GOVERNOR_ADDRESS_L1 || process.env.GOVERNOR_ADDRESS || process.env.GOVERNANCE_CONTRACT_ADDRESS || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L1 || process.env.EXECUTOR_ADDRESS || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L1 || process.env.L1_CHAIN_ID || ""
  },
  L2: {
    rpc: process.env.GOVERNANCE_RPC_L2 || process.env.RPC_L2 || "",
    governor: (process.env.GOVERNOR_ADDRESS_L2 || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L2 || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L2 || process.env.L2_CHAIN_ID || ""
  },
  L3: {
    rpc: process.env.GOVERNANCE_RPC_L3 || process.env.RPC_L3 || "",
    governor: (process.env.GOVERNOR_ADDRESS_L3 || "").toLowerCase(),
    executor: (process.env.EXECUTOR_ADDRESS_L3 || "").toLowerCase(),
    chainId: process.env.GOVERNANCE_CHAIN_ID_L3 || process.env.L3_CHAIN_ID || ""
  }
};

const resolveLayer = (req) => {
  const layerParam = normalizeLayer(req.query?.layer || req.query?.network || "");
  if (layerParam) return layerParam;
  const chainIdParam = String(req.query?.chainId || "");
  if (chainIdParam) {
    const match = Object.entries(layerConfigs).find(([, config]) => String(config.chainId || "") === chainIdParam);
    if (match) return match[0];
  }
  return normalizeLayer(DEFAULT_LAYER) || "L1";
};

const SELECTORS = {
  proposalsLength: "0x44c7c867",
  votingPeriod: "0x02a251a3",
  executor: "0xc34c08e5",
  votingToken: "0xb0340123",
  propose: "0x93ba3f15",
  vote: "0xc9d27afe",
  queue: "0xddf0b009",
  execute: "0xfe0d94c1"
};

const app = express();
app.use(express.json());

const proposals = [];
const delegations = [];

const strip0x = (value = "") => (value.startsWith("0x") ? value.slice(2) : value);
const pad32 = (value = "") => value.padStart(64, "0");
const toHex = (value) => {
  if (typeof value === "bigint") return value.toString(16);
  if (typeof value === "number") return BigInt(value).toString(16);
  if (typeof value === "string") {
    if (value.startsWith("0x")) return strip0x(value);
    return BigInt(value).toString(16);
  }
  return "0";
};
const encodeUint = (value) => pad32(toHex(value));
const encodeBool = (value) => pad32(value ? "1" : "0");
const encodeAddress = (value) => pad32(strip0x(String(value || "")).toLowerCase());
const encodeBytes = (value = "0x") => {
  const raw = strip0x(String(value || ""));
  const length = raw.length / 2;
  const paddedLen = Math.ceil(length / 32) * 64;
  return pad32(length.toString(16)) + raw.padEnd(paddedLen, "0");
};
const decodeAddress = (hex) => {
  if (!hex || hex === "0x") return null;
  return `0x${strip0x(hex).slice(-40)}`;
};
const decodeUint = (hex) => {
  try {
    return BigInt(hex || "0x0").toString();
  } catch {
    return "0";
  }
};

const rpc = async (rpcUrl, method, params = []) => {
  if (!rpcUrl) throw new Error("GOVERNANCE_RPC not configured");
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`RPC ${method} status ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || String(body.error));
  return body.result;
};

const ethCall = async (rpcUrl, to, data) =>
  rpc(rpcUrl, "ghost_call", [
    {
      to,
      data
    },
    "latest"
  ]);

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "governance-service", layers: Object.keys(layerConfigs), defaultLayer: DEFAULT_LAYER })
);
app.get("/config", (req, res) => {
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  res.json({
    ok: true,
    layer,
    governor: config.governor || null,
    executor: config.executor || null,
    rpc: config.rpc || null,
    chainId: config.chainId || null
  });
});

app.get("/onchain", async (req, res) => {
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  if (!config.governor) {
    res.status(400).json({ ok: false, error: "GOVERNOR_ADDRESS not configured", layer });
    return;
  }
  try {
    const [chainId, proposalsLength, votingPeriod, executor, votingToken] = await Promise.all([
      rpc(config.rpc, "ghost_chainId"),
      ethCall(config.rpc, config.governor, SELECTORS.proposalsLength),
      ethCall(config.rpc, config.governor, SELECTORS.votingPeriod),
      ethCall(config.rpc, config.governor, SELECTORS.executor),
      ethCall(config.rpc, config.governor, SELECTORS.votingToken)
    ]);
    res.json({
      ok: true,
      chainId,
      layer,
      governor: config.governor,
      executor: decodeAddress(executor),
      votingToken: decodeAddress(votingToken),
      proposalsLength: decodeUint(proposalsLength),
      votingPeriod: decodeUint(votingPeriod)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/proposals", (_req, res) => {
  res.json({ ok: true, proposals });
});

app.get("/delegations", (_req, res) => {
  res.json({ ok: true, delegations });
});

/** GET /proposals/stats — aggregate proposal and delegation counts */
app.get("/proposals/stats", (_req, res) => {
  res.json({ ok: true, stats: { totalProposals: proposals.length, totalDelegations: delegations.length, fetchedAt: new Date().toISOString() } });
});

app.post("/calldata", (req, res) => {
  const action = String(req.body?.action || "").toLowerCase();
  const layer = resolveLayer(req);
  const config = layerConfigs[layer] || {};
  try {
    if (!config.governor) {
      res.status(400).json({ ok: false, error: "GOVERNOR_ADDRESS not configured", layer });
      return;
    }
    if (action === "propose") {
      const target = req.body?.target;
      const value = req.body?.value ?? "0";
      const data = req.body?.data ?? "0x";
      if (!target) throw new Error("missing target");
      const head =
        encodeAddress(target) + encodeUint(value) + pad32("60"); // offset to bytes
      const tail = encodeBytes(data);
      const calldata = SELECTORS.propose + head + tail;
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "vote") {
      const id = req.body?.id;
      const support = !!req.body?.support;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.vote + encodeUint(id) + encodeBool(support);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "queue") {
      const id = req.body?.id;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.queue + encodeUint(id);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    if (action === "execute") {
      const id = req.body?.id;
      if (id === undefined || id === null) throw new Error("missing id");
      const calldata = SELECTORS.execute + encodeUint(id);
      res.json({ ok: true, layer, to: config.governor, calldata });
      return;
    }
    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  const defaultLayer = normalizeLayer(DEFAULT_LAYER) || "L1";
  const cfg = layerConfigs[defaultLayer] || {};
  console.log(
    `[governance-service] listening on :${PORT} defaultLayer=${defaultLayer} rpc=${cfg.rpc || "unset"}`
  );
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
