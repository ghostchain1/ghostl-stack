import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createLogger, transports, format } from "winston";

const app  = express();
const PORT = process.env.PORT ?? 4302;

const log = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── In-memory oracle feed store ───────────────────────────────────────────
interface FeedValue { value: number | string; ts: number; updatedBy: string; }
interface OracleFeed {
  id: string;
  name: string;
  description: string;
  unit: string;
  type: "price" | "health" | "metric" | "custom";
  latest?: FeedValue;
  history: FeedValue[];
  createdAt: number;
}

const feeds = new Map<string, OracleFeed>();

// Seed GhostChain native feeds
for (const [id, name, description, unit, type] of [
  ["gst-price",     "GST/USD Price",              "GhostChain native token USD price",     "USD",   "price"],
  ["l1-tps",        "L1 Transactions/sec",         "GhostChain L1 throughput",              "tps",   "metric"],
  ["l2-tps",        "L2 Transactions/sec",         "GhostL2 throughput",                    "tps",   "metric"],
  ["l3-tps",        "L3 Transactions/sec",         "GhostL3 throughput",                    "tps",   "metric"],
  ["bridge-health", "Bridge Health Score",         "L1/L2/L3 bridge health aggregate",     "score", "health"],
] as [string, string, string, string, OracleFeed["type"]][]) {
  feeds.set(id, { id, name, description, unit, type, history: [], createdAt: Date.now() });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gsa-oracle", ts: Date.now() });
});

app.get("/feeds", (_req, res) => {
  res.json({ feeds: [...feeds.values()].map(f => ({ ...f, history: undefined })), total: feeds.size });
});

app.get("/feeds/:id", (req, res) => {
  const feed = feeds.get(req.params.id);
  if (!feed) { res.status(404).json({ error: "feed not found" }); return; }
  res.json({ feed });
});

app.post("/feeds", (req, res) => {
  const { name, description, unit, type } = req.body as Partial<OracleFeed>;
  if (!name || !unit) {
    res.status(400).json({ error: "name and unit are required" });
    return;
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (feeds.has(id)) {
    res.status(409).json({ error: `Feed '${id}' already exists` });
    return;
  }
  const feed: OracleFeed = { id, name, description: description ?? "", unit, type: type ?? "custom", history: [], createdAt: Date.now() };
  feeds.set(id, feed);
  log.info("feed.created", { id, name });
  res.status(201).json({ feed });
});

app.post("/feeds/:id/update", (req, res) => {
  const feed = feeds.get(req.params.id);
  if (!feed) { res.status(404).json({ error: "feed not found" }); return; }
  const { value, updatedBy } = req.body as { value?: number | string; updatedBy?: string };
  if (value === undefined) { res.status(400).json({ error: "value is required" }); return; }
  const fv: FeedValue = { value, ts: Date.now(), updatedBy: updatedBy ?? "ghostbrain" };
  feed.latest = fv;
  feed.history.unshift(fv);
  if (feed.history.length > 1000) feed.history = feed.history.slice(0, 1000);
  log.info("feed.updated", { id: feed.id, value });
  res.json({ feed: { ...feed, history: undefined }, latest: fv });
});


app.listen(PORT, () => log.info(`gsa-oracle listening :${PORT}`));
export default app;
