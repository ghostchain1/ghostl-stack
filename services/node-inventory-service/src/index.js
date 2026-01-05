import express from "express";

const PORT = Number(process.env.PORT || 7622);

const app = express();
app.use(express.json());

const sampleNodes = [
  { id: "l2-validator-1", type: "validator", host: "ghostl2", version: "1.3.2", status: "live", lastSeenAt: new Date().toISOString() },
  { id: "l3-validator-1", type: "validator", host: "ghostl3", version: "1.3.2", status: "live", lastSeenAt: new Date().toISOString() }
];

app.get("/health", (_req, res) => res.json({ ok: true, service: "node-inventory-service" }));

app.get("/nodes", (_req, res) => {
  res.json({ ok: true, nodes: sampleNodes });
});

app.listen(PORT, () => {
  console.log(`[node-inventory-service] listening on :${PORT}`);
});
