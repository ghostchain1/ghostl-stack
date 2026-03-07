import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT     = Number(process.env.PORT || 7640);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "rbac.json");

const app = express();
app.use(express.json());

// Built-in roles (immutable schema); user assignments are mutable
const ROLE_DEFS = {
  admin:     { name: "Admin",     permissions: ["*"] },
  ops:       { name: "Ops",       permissions: ["read", "write:ops", "restart", "logs", "policy"] },
  validator: { name: "Validator", permissions: ["read", "vote"] },
  viewer:    { name: "Viewer",    permissions: ["read"] },
};

// user assignments: Map<userId, Set<roleId>>
const assignments = new Map();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj = {};
    for (const [uid, roles] of assignments) obj[uid] = [...roles];
    fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2) + "\n", "utf-8");
  } catch { /* best-effort */ }
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    for (const [uid, roles] of Object.entries(raw)) {
      assignments.set(uid, new Set(Array.isArray(roles) ? roles : []));
    }
  } catch { /* absent is fine */ }
}

load();

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "rbac-service", users: assignments.size })
);

app.get("/roles", (_req, res) => {
  const roles = Object.entries(ROLE_DEFS).map(([id, def]) => ({ id, ...def }));
  res.json({ ok: true, roles });
});

app.get("/roles/:id/permissions", (req, res) => {
  const def = ROLE_DEFS[req.params.id];
  if (!def) return res.status(404).json({ ok: false, error: "role_not_found" });
  res.json({ ok: true, role: req.params.id, permissions: def.permissions });
});

/** GET /users/:userId/roles */
app.get("/users/:userId/roles", (req, res) => {
  const roles = [...(assignments.get(req.params.userId) || [])];
  res.json({ ok: true, userId: req.params.userId, roles });
});

/** POST /users/:userId/roles — assign roles { roles: string[] } */
app.post("/users/:userId/roles", (req, res) => {
  const uid   = req.params.userId;
  const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
  const invalid = roles.filter((r) => !ROLE_DEFS[r]);
  if (invalid.length) return res.status(400).json({ ok: false, error: `unknown roles: ${invalid.join(", ")}` });
  if (!assignments.has(uid)) assignments.set(uid, new Set());
  roles.forEach((r) => assignments.get(uid).add(r));
  persist();
  res.json({ ok: true, userId: uid, roles: [...assignments.get(uid)] });
});

/** DELETE /users/:userId/roles/:roleId */
app.delete("/users/:userId/roles/:roleId", (req, res) => {
  const { userId, roleId } = req.params;
  const set = assignments.get(userId);
  if (!set || !set.has(roleId)) return res.status(404).json({ ok: false, error: "assignment_not_found" });
  set.delete(roleId);
  if (set.size === 0) assignments.delete(userId);
  persist();
  res.json({ ok: true });
});

/** POST /check — { userId, permission } → { allowed: true/false } */
app.post("/check", (req, res) => {
  const { userId, permission } = req.body || {};
  if (!userId || !permission) return res.status(400).json({ ok: false, error: "userId and permission required" });
  const userRoles = [...(assignments.get(userId) || [])];
  const allowed = userRoles.some((r) => {
    const perms = ROLE_DEFS[r]?.permissions || [];
    return perms.includes("*") || perms.includes(permission);
  });
  res.json({ ok: true, userId, permission, allowed });
});

app.listen(PORT, () => {
  console.log(`[rbac-service] listening on :${PORT}, data=${DATA_DIR}`);
});
