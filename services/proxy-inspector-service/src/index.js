import express from "express";

const PORT = Number(process.env.PORT || 7631);
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.use(express.json());

const promQuery = async (query) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`prom ${r.status}`);
    return await r.json();
  } catch (e) { clearTimeout(t); throw e; }
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "proxy-inspector-service", prom: PROM_URL }));

/** GET /proxies — all upgradeable proxy contracts with current impl + admin */
app.get("/proxies", async (_req, res) => {
  try {
    const [upgradeableResp, implResp, adminResp] = await Promise.all([
      promQuery("contracts_upgradeable_total"),
      promQuery("contracts_implementation_address"),
      promQuery("contracts_proxy_admin"),
    ]);
    res.json({
      ok: true,
      total: upgradeableResp?.data?.result?.[0]?.value?.[1] || "0",
      implementations: implResp?.data?.result || [],
      admins: adminResp?.data?.result || [],
    });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /proxies/stats — summary counts + last upgrade timestamp */
app.get("/proxies/stats", async (_req, res) => {
  try {
    const [totalResp, upgradeResp] = await Promise.all([
      promQuery("contracts_upgradeable_total"),
      promQuery("contracts_last_upgrade_timestamp"),
    ]);
    const total = Number(totalResp?.data?.result?.[0]?.value?.[1] || 0);
    const lastUpgradeTs = upgradeResp?.data?.result?.[0]?.value?.[1] || null;
    res.json({ ok: true, total, lastUpgradeTimestamp: lastUpgradeTs });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/** GET /proxies/pending — contracts with pending upgrade proposals */
app.get("/proxies/pending", async (_req, res) => {
  try {
    const resp = await promQuery("contracts_pending_upgrades");
    res.json({ ok: true, pending: resp?.data?.result || [] });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

app.listen(PORT, () => {
  console.log(`[proxy-inspector-service] listening on :${PORT}, PROM=${PROM_URL}`);
});
