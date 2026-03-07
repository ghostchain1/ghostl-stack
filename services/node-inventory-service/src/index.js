import express from "express";

const PORT = Number(process.env.PORT || 7622);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: "node-inventory-service", msg, ...extra }));

const fetchJSON = async (url, timeout = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

const promQueryRange = async (query) => {
  try {
    const data = await fetchJSON(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    return data?.data?.result ?? [];
  } catch {
    return [];
  }
};

/** Build node records from Prometheus up/version metrics; falls back to seed list. */
const getNodes = async () => {
  // Try to discover nodes from Prometheus scrape targets reporting ghost_node_info
  const nodeInfoResults = await promQueryRange('ghost_node_info');
  if (nodeInfoResults.length > 0) {
    return nodeInfoResults.map((r) => ({
      id: r.metric?.node_id ?? r.metric?.instance ?? r.metric?.job,
      type: r.metric?.node_type ?? "validator",
      host: r.metric?.instance ?? r.metric?.node_id,
      version: r.metric?.version ?? "unknown",
      status: Number(r.value?.[1]) === 1 ? "live" : "degraded",
      layer: r.metric?.layer ?? "l2",
      lastSeenAt: new Date().toISOString(),
    }));
  }

  // Fallback to environment-configured node list (comma-separated JSON array)
  const envNodes = process.env.STATIC_NODES;
  if (envNodes) {
    try {
      return JSON.parse(envNodes);
    } catch {
      log("warn", "STATIC_NODES is not valid JSON, using seed nodes");
    }
  }

  // Seed inventory — useful for dev/testnet
  return [
    { id: "l2-validator-0", type: "validator", host: process.env.L2_HOST || "ghostl2", version: process.env.L2_VERSION || "1.3.2", status: "live", layer: "l2", lastSeenAt: new Date().toISOString() },
    { id: "l2-validator-1", type: "validator", host: process.env.L2_HOST || "ghostl2", version: process.env.L2_VERSION || "1.3.2", status: "live", layer: "l2", lastSeenAt: new Date().toISOString() },
    { id: "l3-validator-0", type: "validator", host: process.env.L3_HOST || "ghostl3", version: process.env.L3_VERSION || "1.3.2", status: "live", layer: "l3", lastSeenAt: new Date().toISOString() },
  ];
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-inventory-service" }));

app.get("/nodes", async (_req, res) => {
  const nodes = await getNodes();
  res.json({ ok: true, nodes, fetchedAt: new Date().toISOString() });
});

/** GET /nodes/stats — aggregate counts by layer, type, and status */
app.get("/nodes/stats", async (_req, res) => {
  const nodes = await getNodes();
  const byLayer  = {};
  const byType   = {};
  const byStatus = {};
  for (const n of nodes) {
    const layer  = n.layer  || "unknown";
    const type   = n.type   || "unknown";
    const status = n.status || "unknown";
    byLayer[layer]   = (byLayer[layer]   || 0) + 1;
    byType[type]     = (byType[type]     || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;
  }
  res.json({
    ok: true,
    total: nodes.length,
    live: byStatus["live"] || 0,
    degraded: (byStatus["degraded"] || 0) + (byStatus["unknown"] || 0),
    byLayer,
    byType,
    byStatus,
    fetchedAt: new Date().toISOString(),
  });
});

app.get("/nodes/:id", async (req, res) => {
  const nodes = await getNodes();
  const node = nodes.find((n) => n.id === req.params.id);
  if (!node) return res.status(404).json({ ok: false, error: "node_not_found" });
  res.json({ ok: true, node });
});

app.get("/nodes/:id/status", async (req, res) => {
  const { id } = req.params;
  try {
    const results = await promQueryRange(`ghost_node_up{node_id="${id}"}`);
    const up = results[0] ? Number(results[0].value?.[1]) === 1 : null;
    res.json({ ok: true, nodeId: id, up, checkedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => log("info", `listening on :${PORT}`, { promUrl: PROM_URL }));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
