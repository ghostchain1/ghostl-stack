import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7604);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";
const AUTH_TOKEN = process.env.ADMIN_TOKEN || "";
const INCIDENTS_FILE = process.env.INCIDENTS_FILE || path.join(process.cwd(), "data", "bridge-incidents.json");

const parseCorsAllowlist = () => {
  const raw = process.env.CORS_ALLOW_ORIGINS || "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
};

const isLocalOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return false;
  }
};

const corsAllowlist = parseCorsAllowlist();
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (corsAllowlist.size) return corsAllowlist.has(origin);
  if (process.env.NODE_ENV !== "production") return isLocalOrigin(origin);
  return false;
};

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true
  })
);
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

const requireAdmin = (req, res, next) => {
  if (!AUTH_TOKEN) {
    res.status(500).json({ ok: false, error: "admin_token_not_configured" });
    return;
  }
  const token = req.header("x-admin-token");
  if (token !== AUTH_TOKEN) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  next();
};

const ensureDir = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });

const loadIncidents = () => {
  try {
    const raw = fs.readFileSync(INCIDENTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    ensureDir(INCIDENTS_FILE);
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify([]));
    return [];
  }
};

const saveIncidents = (items) => {
  ensureDir(INCIDENTS_FILE);
  fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(items, null, 2));
};

let bridgeState = {
  status: "live",
  feeBps: 0
};

let incidents = loadIncidents();

app.get("/health", (_req, res) => res.json({ ok: true, service: "bridge-service" }));

app.get("/bridges", async (_req, res) => {
  try {
    const pendingResp = await promQuery("ghost_relayer_pending_finalizations");
    const finalizedResp = await promQuery("ghost_relayer_finalize_success_total");
    const pending = pendingResp?.data?.result?.[0]?.value?.[1] || "0";
    const finalized = finalizedResp?.data?.result?.[0]?.value?.[1] || "0";
    res.json({
      ok: true,
      bridges: [
        { id: "l2-l3", srcChain: "l2", dstChain: "l3", status: "live", pending, finalized },
        { id: "l3-l2", srcChain: "l3", dstChain: "l2", status: "live", pending, finalized }
      ]
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.post("/bridges/pause", requireAdmin, (_req, res) => {
  bridgeState.status = "paused";
  res.json({ ok: true, status: bridgeState.status });
});

app.post("/bridges/resume", requireAdmin, (_req, res) => {
  bridgeState.status = "live";
  res.json({ ok: true, status: bridgeState.status });
});

app.get("/bridges/fees", requireAdmin, (_req, res) => {
  res.json({ ok: true, feeBps: bridgeState.feeBps });
});

app.post("/bridges/fees", requireAdmin, (req, res) => {
  const bps = Number(req.body?.feeBps);
  if (Number.isNaN(bps) || bps < 0 || bps > 10_000) {
    res.status(400).json({ ok: false, error: "invalid_fee_bps" });
    return;
  }
  bridgeState.feeBps = bps;
  res.json({ ok: true, feeBps: bridgeState.feeBps });
});

app.get("/bridges/incidents", requireAdmin, (_req, res) => {
  res.json({ ok: true, incidents });
});

app.post("/bridges/incidents", requireAdmin, (req, res) => {
  const { type, severity, message, metadata } = req.body || {};
  if (!type || !severity || !message) {
    res.status(400).json({ ok: false, error: "type, severity, and message required" });
    return;
  }
  const entry = {
    id: `inc-${Date.now()}`,
    type,
    severity,
    message,
    metadata: metadata || {},
    createdAt: new Date().toISOString()
  };
  incidents.push(entry);
  saveIncidents(incidents);
  console.log(`[bridge-service] incident logged`, entry);
  res.status(201).json({ ok: true, incident: entry });
});

app.listen(PORT, () => {
  console.log(`[bridge-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
