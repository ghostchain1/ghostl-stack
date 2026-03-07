import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7630);
const DATA_PATH = process.env.VERIFICATION_STORE || path.join(process.cwd(), "data", "verifications.json");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "verification-service" }));

const load = () => {
  if (!fs.existsSync(DATA_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); } catch { return []; }
};

const save = (items) => {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2));
};

/** List verifications — filter by ?status= or ?chainId= */
app.get("/verifications", (req, res) => {
  let items = load();
  if (req.query.status) items = items.filter((v) => v.status === req.query.status);
  if (req.query.chainId) items = items.filter((v) => String(v.chainId) === req.query.chainId);
  const limit  = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, total: load().length, verifications: items.slice(offset, offset + limit) });
});

/** GET /verifications/stats — counts by status */
app.get("/verifications/stats", (_req, res) => {
  const items = load();
  const byStatus = {};
  for (const v of items) byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  res.json({ ok: true, stats: { total: items.length, byStatus, fetchedAt: new Date().toISOString() } });
});


app.get("/verifications/:id", (req, res) => {
  const items = load();
  const v = items.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, verification: v });
});

/** Submit a contract for verification */
app.post("/verifications", (req, res) => {
  const { address, chainId, sourceHash, compilerVersion, constructorArgs } = req.body || {};
  if (!address || !chainId) return res.status(400).json({ ok: false, error: "address and chainId required" });
  const items = load();
  if (items.find((v) => v.address === address && String(v.chainId) === String(chainId))) {
    return res.status(409).json({ ok: false, error: "already_submitted" });
  }
  const entry = {
    id: crypto.randomUUID(),
    address,
    chainId: String(chainId),
    sourceHash: sourceHash || null,
    compilerVersion: compilerVersion || null,
    constructorArgs: constructorArgs || null,
    status: "pending",
    verifiedAt: null,
    createdAt: new Date().toISOString(),
  };
  items.push(entry);
  save(items);
  res.status(201).json({ ok: true, verification: entry });
});

/** Update verification status (e.g. verified / failed) */
app.patch("/verifications/:id", (req, res) => {
  const items = load();
  const idx = items.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });
  const { status, message } = req.body || {};
  const VALID = ["pending", "verified", "failed", "partial"];
  if (status && !VALID.includes(status)) {
    return res.status(400).json({ ok: false, error: `status must be one of: ${VALID.join(", ")}` });
  }
  items[idx] = { ...items[idx], ...(status ? { status } : {}), ...(message ? { message } : {}), updatedAt: new Date().toISOString() };
  if (status === "verified") items[idx].verifiedAt = new Date().toISOString();
  save(items);
  res.json({ ok: true, verification: items[idx] });
});

app.delete("/verifications/:id", (req, res) => {
  const items = load();
  const idx = items.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });
  items.splice(idx, 1);
  save(items);
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`[verification-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
