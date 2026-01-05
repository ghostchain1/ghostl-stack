import express from "express";

const PORT = Number(process.env.PORT || 7642);

const app = express();
app.use(express.json());

const commands = [
  { id: "restart-l2", label: "Restart L2", category: "Ops" },
  { id: "restart-l3", label: "Restart L3", category: "Ops" },
  { id: "open-validators", label: "Open Validators", category: "Navigation" }
];

app.get("/health", (_req, res) => res.json({ ok: true, service: "command-palette-service" }));

app.get("/commands", (_req, res) => {
  res.json({ ok: true, commands });
});

app.listen(PORT, () => {
  console.log(`[command-palette-service] listening on :${PORT}`);
});
