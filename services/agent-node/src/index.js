import express from "express";
import os from "node:os";

const PORT = Number(process.env.PORT || 7702);
const AGENT_ROLE = process.env.AGENT_ROLE || "agent";
const AGENT_ID = process.env.AGENT_ID || `${AGENT_ROLE}-${os.hostname()}`;
const AGENT_REGISTRY_URL = process.env.AGENT_REGISTRY_URL || "";
const EVIDENCE_URL = process.env.EVIDENCE_URL || "";
const GOVERNANCE_POLICY_REQUIRED = String(process.env.GOVERNANCE_POLICY_REQUIRED || "true").toLowerCase() === "true";
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 10000);
const WATCHDOG_TARGETS = (process.env.WATCHDOG_TARGETS || "").split(",").map((t) => t.trim()).filter(Boolean);
const WATCHDOG_INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS || 15000);

const app = express();
app.use(express.json({ limit: "1mb" }));

const postJson = async (url, body) => {
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
};

const logEvidence = async (entry) => {
  if (!EVIDENCE_URL) return;
  try {
    await postJson(`${EVIDENCE_URL}/logs`, entry);
  } catch {
    // swallow evidence errors to avoid blocking agent
  }
};

const policyCheck = async (action) => {
  if (!GOVERNANCE_POLICY_REQUIRED || !AGENT_REGISTRY_URL) return true;
  try {
    const resp = await fetch(`${AGENT_REGISTRY_URL}/policy/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: AGENT_ROLE, action }),
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return Boolean(data.allowed);
  } catch {
    return false;
  }
};

const heartbeat = async (status = "ok", info = {}) => {
  if (!AGENT_REGISTRY_URL) return;
  try {
    await postJson(`${AGENT_REGISTRY_URL}/agents/heartbeat`, {
      agentId: AGENT_ID,
      role: AGENT_ROLE,
      status,
      info
    });
  } catch {
    // ignore heartbeat failures
  }
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, role: AGENT_ROLE, agentId: AGENT_ID });
});

/** GET /status — agent identity and runtime configuration */
app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    agentId: AGENT_ID,
    role: AGENT_ROLE,
    registryUrl: AGENT_REGISTRY_URL || null,
    evidenceUrl: EVIDENCE_URL || null,
    policyRequired: GOVERNANCE_POLICY_REQUIRED,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    watchdog: { enabled: AGENT_ROLE === "watchdog", targets: WATCHDOG_TARGETS, intervalMs: WATCHDOG_INTERVAL_MS },
    ts: new Date().toISOString(),
  });
});

/** GET /stats — agent identity and watchdog summary */
app.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: { agentId: AGENT_ID, role: AGENT_ROLE, policyRequired: GOVERNANCE_POLICY_REQUIRED, heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS, watchdog: { enabled: AGENT_ROLE === "watchdog", targets: WATCHDOG_TARGETS.length, intervalMs: WATCHDOG_INTERVAL_MS }, fetchedAt: new Date().toISOString() } });
});

app.post("/task", async (req, res) => {
  const action = req.body?.action || "unknown";
  const payload = req.body?.payload || {};
  const allowed = await policyCheck(action);
  if (!allowed) {
    await logEvidence({
      ts: new Date().toISOString(),
      agentId: AGENT_ID,
      role: AGENT_ROLE,
      action,
      status: "rejected"
    });
    res.status(403).json({ ok: false, error: "policy_blocked" });
    return;
  }

  await logEvidence({
    ts: new Date().toISOString(),
    agentId: AGENT_ID,
    role: AGENT_ROLE,
    action,
    status: "accepted",
    payload
  });

  res.json({ ok: true, action, agentId: AGENT_ID });
});

const startWatchdog = () => {
  if (AGENT_ROLE !== "watchdog" || WATCHDOG_TARGETS.length === 0) return;
  setInterval(async () => {
    for (const target of WATCHDOG_TARGETS) {
      try {
        const resp = await fetch(target, { signal: AbortSignal.timeout(4000) });
        if (!resp.ok) {
          await logEvidence({
            ts: new Date().toISOString(),
            agentId: AGENT_ID,
            role: AGENT_ROLE,
            action: "watchdog.healthcheck",
            status: "degraded",
            target,
            code: resp.status
          });
        }
      } catch (err) {
        await logEvidence({
          ts: new Date().toISOString(),
          agentId: AGENT_ID,
          role: AGENT_ROLE,
          action: "watchdog.healthcheck",
          status: "down",
          target,
          error: err?.message || String(err)
        });
      }
    }
  }, WATCHDOG_INTERVAL_MS);
};

setInterval(() => {
  heartbeat();
}, HEARTBEAT_INTERVAL_MS);

startWatchdog();

const server = app.listen(PORT, () => {
  console.log(`[agent-node] role=${AGENT_ROLE} id=${AGENT_ID} listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
