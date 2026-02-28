import express from "express";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";

type FlowEvent = {
  eventId: string;
  ts: string;
  layerFrom: "L3" | "L2" | "L1" | "EXT";
  layerTo: "L2" | "L1" | "EXT" | "DIST";
  amountWei: string;
  ref: string;
};

type AllocationEvent = {
  eventId: string;
  ts: string;
  strategy: string;
  amountWei: string;
  riskScoreBps: number;
  proposalId: string;
};

type SnapshotRef = {
  epoch: number;
  root: string;
  uri: string;
  ts: string;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || "7603");
const HOST = process.env.HOST || "0.0.0.0";

const flows: FlowEvent[] = [];
const allocations: AllocationEvent[] = [];
const snapshots: SnapshotRef[] = [];

let treasuryBalanceWei = 0n;
let totalL3ToL2Wei = 0n;
let totalL2ToL1Wei = 0n;
let totalExternalAllocatedWei = 0n;
let totalYieldReturnedWei = 0n;
let totalDistributedWei = 0n;

const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "hg_reporting_indexer_" });
const ingestCounter = new Counter({
  name: "hg_reporting_indexer_ingest_total",
  help: "Total ingested events",
  registers: [registry],
  labelNames: ["type"]
});

const asBigInt = (value: string | number | bigint): bigint => BigInt(String(value));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hg-reporting-indexer", flows: flows.length, allocations: allocations.length });
});

app.get("/metrics", async (_req, res) => {
  res.set("content-type", registry.contentType);
  res.send(await registry.metrics());
});

app.post("/v1/ingest/flow", (req, res) => {
  const event = req.body as FlowEvent;
  if (!event?.eventId || !event?.layerFrom || !event?.layerTo || !event?.amountWei) {
    res.status(400).json({ ok: false, error: "invalid_flow_event" });
    return;
  }

  const amount = asBigInt(event.amountWei);
  flows.push({ ...event, ts: event.ts || new Date().toISOString() });

  if (event.layerFrom === "L3" && event.layerTo === "L2") totalL3ToL2Wei += amount;
  if (event.layerFrom === "L2" && event.layerTo === "L1") {
    totalL2ToL1Wei += amount;
    treasuryBalanceWei += amount;
  }
  if (event.layerFrom === "L1" && event.layerTo === "EXT") {
    totalExternalAllocatedWei += amount;
    treasuryBalanceWei -= amount;
  }
  if (event.layerFrom === "EXT" && event.layerTo === "L1") {
    totalYieldReturnedWei += amount;
    treasuryBalanceWei += amount;
  }
  if (event.layerFrom === "L1" && event.layerTo === "DIST") {
    totalDistributedWei += amount;
    treasuryBalanceWei -= amount;
  }

  ingestCounter.inc({ type: "flow" });
  res.json({ ok: true, count: flows.length });
});

app.post("/v1/ingest/allocation", (req, res) => {
  const event = req.body as AllocationEvent;
  if (!event?.eventId || !event?.strategy || !event?.amountWei || !event?.proposalId) {
    res.status(400).json({ ok: false, error: "invalid_allocation_event" });
    return;
  }
  allocations.push({ ...event, ts: event.ts || new Date().toISOString() });
  ingestCounter.inc({ type: "allocation" });
  res.json({ ok: true, count: allocations.length });
});

app.post("/v1/ingest/snapshot", (req, res) => {
  const event = req.body as SnapshotRef;
  if (!event || !event.root || !event.uri || typeof event.epoch !== "number") {
    res.status(400).json({ ok: false, error: "invalid_snapshot" });
    return;
  }
  snapshots.push({ ...event, ts: event.ts || new Date().toISOString() });
  ingestCounter.inc({ type: "snapshot" });
  res.json({ ok: true, count: snapshots.length });
});

app.get("/v1/treasury/holdings", (_req, res) => {
  res.json({
    ok: true,
    treasuryBalanceWei: treasuryBalanceWei.toString(),
    positions: allocations.slice(-100)
  });
});

app.get("/v1/flows/summary", (_req, res) => {
  res.json({
    ok: true,
    totals: {
      l3ToL2Wei: totalL3ToL2Wei.toString(),
      l2ToL1Wei: totalL2ToL1Wei.toString(),
      externalAllocatedWei: totalExternalAllocatedWei.toString(),
      yieldReturnedWei: totalYieldReturnedWei.toString(),
      distributedWei: totalDistributedWei.toString()
    },
    flowCount: flows.length
  });
});

app.get("/v1/governance/executions", (_req, res) => {
  res.json({ ok: true, receipts: allocations.slice(-100) });
});

app.get("/v1/risk/exposures", (_req, res) => {
  const exposureByStrategy = allocations.reduce<Record<string, bigint>>((acc, row) => {
    const prev = acc[row.strategy] || 0n;
    acc[row.strategy] = prev + asBigInt(row.amountWei);
    return acc;
  }, {});

  res.json({
    ok: true,
    exposures: Object.entries(exposureByStrategy).map(([strategy, exposureWei]) => ({ strategy, exposureWei: exposureWei.toString() }))
  });
});

app.get("/v1/proofs/snapshots", (_req, res) => {
  res.json({ ok: true, snapshots: snapshots.slice(-200) });
});

app.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", service: "hg-reporting-indexer", msg: "started", port: PORT }));
});
