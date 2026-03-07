import express from "express";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT || 7642);

const app = express();
app.use(express.json());

// Built-in commands (immutable seed)
const BUILTIN = [
  { id: "restart-l2",       label: "Restart L2",        category: "Ops",        builtin: true },
  { id: "restart-l3",       label: "Restart L3",        category: "Ops",        builtin: true },
  { id: "open-validators",  label: "Open Validators",   category: "Navigation", builtin: true },
  { id: "view-logs",        label: "View Logs",         category: "Navigation", builtin: true },
  { id: "run-snapshot",     label: "Run Snapshot",      category: "Ops",        builtin: true },
  { id: "clear-cache",      label: "Clear Cache",       category: "Ops",        builtin: true },
  { id: "open-governance",  label: "Open Governance",   category: "Navigation", builtin: true },
];

// runtime-registered commands
const custom = new Map(); // id → command

function allCommands() {
  return [...BUILTIN, ...custom.values()];
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "command-palette-service", total: allCommands().length })
);

/** GET /commands?category=&q= — list all commands with optional filter */
app.get("/commands", (req, res) => {
  let cmds = allCommands();
  if (req.query.category) {
    cmds = cmds.filter((c) => c.category?.toLowerCase() === String(req.query.category).toLowerCase());
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    cmds = cmds.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }
  res.json({ ok: true, total: cmds.length, commands: cmds });
});

/** GET /commands/stats — counts by category and builtin vs custom */
app.get("/commands/stats", (_req, res) => {
  const all = allCommands();
  const byCategory = {};
  for (const c of all) {
    const cat = c.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  res.json({ ok: true, stats: { total: all.length, builtin: BUILTIN.length, custom: custom.size, byCategory } });
});


/** GET /commands/:id */
app.get("/commands/:id", (req, res) => {
  const cmd = allCommands().find((c) => c.id === req.params.id);
  if (!cmd) return res.status(404).json({ ok: false, error: "command_not_found" });
  res.json({ ok: true, command: cmd });
});

/** POST /commands — register a custom command */
app.post("/commands", (req, res) => {
  const { label, category, action } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, error: "label required" });
  const id = req.body.id || `custom-${crypto.randomUUID().slice(0, 8)}`;
  if (BUILTIN.some((c) => c.id === id)) {
    return res.status(409).json({ ok: false, error: "id conflicts with builtin command" });
  }
  const cmd = { id, label, category: category || "Custom", action: action || null, builtin: false };
  custom.set(id, cmd);
  res.status(201).json({ ok: true, command: cmd });
});

/** DELETE /commands/:id — remove a custom command (builtins are protected) */
app.delete("/commands/:id", (req, res) => {
  if (BUILTIN.some((c) => c.id === req.params.id)) {
    return res.status(403).json({ ok: false, error: "cannot delete builtin command" });
  }
  if (!custom.has(req.params.id)) return res.status(404).json({ ok: false, error: "command_not_found" });
  custom.delete(req.params.id);
  res.json({ ok: true });
});

/** POST /commands/:id/execute — record execution (no-op for builtins; returns action for custom) */
app.post("/commands/:id/execute", (req, res) => {
  const cmd = allCommands().find((c) => c.id === req.params.id);
  if (!cmd) return res.status(404).json({ ok: false, error: "command_not_found" });
  res.json({ ok: true, command: cmd, executedAt: new Date().toISOString(), context: req.body || {} });
});

const server = app.listen(PORT, () => {
  console.log(`[command-palette-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
