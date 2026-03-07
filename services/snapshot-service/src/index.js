import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 7624);
const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || process.env.SNAPSHOT_EVIDENCE_DIR || "/tmp/ghost-proofs";

const app = express();
app.use(express.json());

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

// In-memory store for snapshots registered via POST (runtime only)
const inMemory = [];

app.get("/health", (_req, res) => res.json({ ok: true, service: "snapshot-service", dir: SNAPSHOT_DIR }));

app.get("/snapshots", (req, res) => {
  const diskSnaps = loadFromDisk();
  const all = [...diskSnaps, ...inMemory];
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: all.length, snapshots: all.slice(offset, offset + limit) });
});

app.get("/snapshots/:id", (req, res) => {
  const all = [...loadFromDisk(), ...inMemory];
  const snap = all.find((s) => s.snapshotId === req.params.id || s.epoch === Number(req.params.id));
  if (!snap) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, snapshot: snap });
});

app.post("/snapshots", (req, res) => {
  const { snapshotId, epoch, merkleRoot } = req.body || {};
  if (!epoch && !snapshotId) return res.status(400).json({ ok: false, error: "epoch or snapshotId required" });
  const snap = {
    snapshotId: snapshotId || crypto.randomUUID(),
    epoch: epoch ?? null,
    merkleRoot: merkleRoot || null,
    timestamp: new Date().toISOString(),
    source: "manual",
  };
  inMemory.push(snap);
  res.status(201).json({ ok: true, snapshot: snap });
});

app.listen(PORT, () => {
  console.log(`[snapshot-service] listening on :${PORT}, dir=${SNAPSHOT_DIR}`);
});

