import express from "express";
import fs from "node:fs";
import path from "node:path";

const PORT     = Number(process.env.PORT || 7640);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE  = path.join(DATA_DIR, "rbac.json");

const app = express();
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.removeHeader("X-Powered-By");
  next();
});
const _CORS_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && _CORS_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


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

/** GET /users — list all users with their assigned roles */
app.get("/users", (_req, res) => {
  const users = [];
  for (const [userId, roleSet] of assignments) {
    users.push({ userId, roles: [...roleSet] });
  }
  res.json({ ok: true, total: users.length, users });
});

/** DELETE /users/:userId — remove all role assignments for a user */
app.delete("/users/:userId", (req, res) => {
  const { userId } = req.params;
  if (!assignments.has(userId)) return res.status(404).json({ ok: false, error: "user_not_found" });
  assignments.delete(userId);
  persist();
  res.json({ ok: true, userId });
});

/** GET /rbac/stats — summary of users, roles, and assignment coverage */
app.get("/rbac/stats", (_req, res) => {
  const roleCount = Object.keys(ROLE_DEFS).length;
  const userCount = assignments.size;
  const assignmentCount = [...assignments.values()].reduce((sum, s) => sum + s.size, 0);
  const roleUsage = {};
  for (const roleSet of assignments.values()) {
    for (const r of roleSet) roleUsage[r] = (roleUsage[r] || 0) + 1;
  }
  res.json({ ok: true, stats: { userCount, roleCount, assignmentCount, roleUsage, fetchedAt: new Date().toISOString() } });
});


app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`[rbac-service] listening on :${PORT}, data=${DATA_DIR}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
