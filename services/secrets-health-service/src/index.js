import express from "express";

const PORT     = Number(process.env.PORT || 7618);
const PROM_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const VAULT_URL = process.env.VAULT_ADDR || "http://localhost:8200";

const app = express();
app.use(express.json());

async function promQuery(q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(
      `${PROM_URL}/api/v1/query?query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    const j = await r.json();
    return j?.data?.result ?? [];
  } catch { return []; } finally { clearTimeout(timer); }
}

function scalar(results) {
  const v = results?.[0]?.value?.[1];
  return v != null ? parseFloat(v) : null;
}

/** Fetch Vault sys/health for sealed status and standby */
async function fetchVaultHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`${VAULT_URL}/v1/sys/health?standbyok=true`, { signal: controller.signal });
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "secrets-health-service" })
);

/** GET /secrets — comprehensive Vault/secrets metrics */
app.get("/secrets", async (_req, res) => {
  const start = Date.now();
  const [vaultHealth, sealedRes, leaseRes, keyRes, reqCountRes, reqLatRes, errorRateRes] = await Promise.all([
    fetchVaultHealth(),
    promQuery("vault_sealed"),
    promQuery("vault_core_active_lease_count"),
    promQuery("vault_core_key_count"),
    promQuery("rate(vault_core_request_count[5m])"),
    promQuery("vault_barrier_request_duration_seconds"),
    promQuery("rate(vault_core_request_errors_total[5m])"),
  ]);

  const latencyMs = Date.now() - start;
  const sealed    = scalar(sealedRes) === 1;
  const leaseCount = scalar(leaseRes);
  const keyCount   = scalar(keyRes);
  const reqRate    = scalar(reqCountRes);
  const latency    = scalar(reqLatRes);
  const errorRate  = scalar(errorRateRes);

  res.json({
    ok: true,
    sealed,
    status: sealed ? "sealed" : "unsealed",
    vaultInitialized: vaultHealth?.initialized ?? null,
    vaultStandby:     vaultHealth?.standby ?? null,
    metrics: {
      activeLeaseCount: leaseCount,
      keyCount,
      requestRatePerSec: reqRate,
      avgRequestLatencyMs: latency != null ? latency * 1000 : null,
      errorRatePerSec: errorRate,
    },
    probeLatencyMs: latencyMs,
    ts: new Date().toISOString(),
  });
});

/** GET /secrets/stats — aggregated stats for dashboards */
app.get("/secrets/stats", async (_req, res) => {
  const [sealedRes, leaseRes, keyRes, reqCountRes] = await Promise.all([
    promQuery("vault_sealed"),
    promQuery("vault_core_active_lease_count"),
    promQuery("vault_core_key_count"),
    promQuery("increase(vault_core_request_count[1h])"),
  ]);
  res.json({
    ok: true,
    sealed: scalar(sealedRes) === 1,
    activeLeaseCount: scalar(leaseRes),
    keyCount: scalar(keyRes),
    requestsLastHour: scalar(reqCountRes),
    ts: new Date().toISOString(),
  });
});

/** GET /secrets/health — simplified health check (sealed vs unsealed) */
app.get("/secrets/health", async (_req, res) => {
  const vaultHealth = await fetchVaultHealth();
  const sealedRes   = await promQuery("vault_sealed");
  const sealed = scalar(sealedRes) === 1 || vaultHealth?.sealed === true;
  res.status(sealed ? 503 : 200).json({
    ok: !sealed,
    sealed,
    initialized: vaultHealth?.initialized ?? null,
    version: vaultHealth?.version ?? null,
    ts: new Date().toISOString(),
  });
});

/** POST /secrets/rotate-trigger — signal that a rotation should occur (logs intent) */
app.post("/secrets/rotate-trigger", (req, res) => {
  const { keyPath, reason } = req.body || {};
  if (!keyPath) return res.status(400).json({ ok: false, error: "keyPath required" });
  console.log(`[secrets-health] rotate-trigger: keyPath=${keyPath} reason=${reason || "manual"} at ${new Date().toISOString()}`);
  res.json({ ok: true, queued: true, keyPath, ts: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`[secrets-health-service] listening on :${PORT}`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
