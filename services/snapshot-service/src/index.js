import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7624);
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || process.env.SNAPSHOT_EVIDENCE_DIR || "/tmp/ghost-proofs";

const app = express();
app.use(express.json({ limit: "256kb" }));

/** Read all JSON receipt files written by hg-proof-snapshotter */
function loadFromDisk() {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) return [];
    return fs.readdirSync(SNAPSHOT_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, f), "utf-8")); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch { return []; }
}

// In-memory store for snapshots registered via POST
const inMemory = new Map(); // id → snapshot

app.get("/health", (_req, res) => res.json({ ok: true, service: "snapshot-service", dir: SNAPSHOT_DIR, memCount: inMemory.size }));

/** GET /snapshots — paginated list merging disk + in-memory */
app.get("/snapshots", (req, res) => {
  const diskSnaps = loadFromDisk();
  const memSnaps  = [...inMemory.values()];
  let all = [...diskSnaps, ...memSnaps].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta; // newest first
  });
  if (req.query.source) all = all.filter((s) => s.source === req.query.source);
  const limit  = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: all.length, snapshots: all.slice(offset, offset + limit) });
});

/** GET /snapshots/stats — count by source, latest epoch */
app.get("/snapshots/stats", (req, res) => {
  const all = [...loadFromDisk(), ...inMemory.values()];
  const bySource = {};
  let latestEpoch = null;
  for (const s of all) {
    const src = s.source || "unknown";
    bySource[src] = (bySource[src] || 0) + 1;
    if (s.epoch != null && (latestEpoch === null || s.epoch > latestEpoch)) latestEpoch = s.epoch;
  }
  res.json({ ok: true, total: all.length, bySource, latestEpoch });
});

/** GET /snapshots/:id — lookup by snapshotId or epoch */
app.get("/snapshots/:id", (req, res) => {
  const id = req.params.id;
  // check in-memory first
  if (inMemory.has(id)) return res.json({ ok: true, snapshot: inMemory.get(id) });
  const all = [...loadFromDisk(), ...inMemory.values()];
  const snap = all.find((s) => s.snapshotId === id || String(s.epoch) === id);
  if (!snap) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, snapshot: snap });
});

/** POST /snapshots — register a snapshot manually */
app.post("/snapshots", (req, res) => {
  const { snapshotId, epoch, merkleRoot, metadata } = req.body || {};
  if (!epoch && !snapshotId) return res.status(400).json({ ok: false, error: "epoch or snapshotId required" });
  const id = snapshotId || crypto.randomUUID();
  const snap = {
    snapshotId: id,
    epoch: epoch ?? null,
    merkleRoot: merkleRoot || null,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
    source: "manual",
  };
  inMemory.set(id, snap);
  res.status(201).json({ ok: true, snapshot: snap });
});

/** DELETE /snapshots/:id — remove from in-memory store (disk files are immutable) */
app.delete("/snapshots/:id", (req, res) => {
  if (!inMemory.has(req.params.id)) return res.status(404).json({ ok: false, error: "not_found_or_immutable" });
  inMemory.delete(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[snapshot-service] listening on :${PORT}, dir=${SNAPSHOT_DIR}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
