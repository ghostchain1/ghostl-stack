import express from "express";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.PORT || 7630);
const DATA_PATH = process.env.VERIFICATION_STORE || path.join(process.cwd(), "data", "verifications.json");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "verification-service" }));

const load = () => {
  if (!fs.existsSync(DATA_PATH)) return [];
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (items) => {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2));
};

app.get("/verifications", (_req, res) => {
  res.json({ ok: true, items: load() });
});

app.post("/verifications", (req, res) => {
  const items = load();
  const entry = req.body || {};
  if (!entry.address || !entry.chainId) {
    res.status(400).json({ ok: false, error: "address and chainId required" });
    return;
  }
  items.push({ ...entry, createdAt: new Date().toISOString() });
  save(items);
  res.status(201).json({ ok: true, entry });
});

app.listen(PORT, () => {
  console.log(`[verification-service] listening on :${PORT}`);
});
