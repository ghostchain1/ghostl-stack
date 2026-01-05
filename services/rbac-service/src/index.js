import express from "express";

const PORT = Number(process.env.PORT || 7640);

const app = express();
app.use(express.json());

const roleOrder = ["Admin", "Ops", "Validator", "Viewer"];
const permissions = [
  { role: "Admin", permissions: ["*"] },
  { role: "Ops", permissions: ["read", "write:ops", "restart", "logs", "policy"] },
  { role: "Validator", permissions: ["read", "vote"] },
  { role: "Viewer", permissions: ["read"] }
];

app.get("/health", (_req, res) => res.json({ ok: true, service: "rbac-service" }));

app.get("/roles", (_req, res) => {
  res.json({ ok: true, roles: roleOrder.map((name) => ({ id: name.toLowerCase(), name })) });
});

app.get("/permissions", (_req, res) => {
  res.json({ ok: true, permissions });
});

app.listen(PORT, () => {
  console.log(`[rbac-service] listening on :${PORT}`);
});
