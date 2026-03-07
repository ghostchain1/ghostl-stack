import express from "express";

const PORT = Number(process.env.PORT || 7629);
const REWARD_DISTRIBUTOR_URL = process.env.REWARD_DISTRIBUTOR_URL || "http://localhost:7684";
const PROM_URL = process.env.PROM_URL || "http://localhost:9090";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: "payout-service", msg, ...extra }));

const fetchJSON = async (url, timeout = 5000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

const promQuery = async (query) => {
  try {
    const data = await fetchJSON(`${PROM_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
    return data?.data?.result?.[0]?.value?.[1] ?? null;
  } catch {
    return null;
  }
};

/** Map a reward-distributor cycle record into a normalised payout record. */
const cycleToPayoutRecord = (cycle) => ({
  id: cycle.id ?? cycle.cycleId ?? cycle.cycle_id,
  cycleId: cycle.cycleId ?? cycle.cycle_id ?? cycle.id,
  status: cycle.status ?? (cycle.executedAt || cycle.executed_at ? "executed" : "pending"),
  totalAmountWei: cycle.totalAmountWei ?? cycle.total_amount_wei ?? cycle.netYieldWei ?? "0",
  validatorAmountWei: cycle.validatorAmountWei ?? cycle.validator_amount_wei ?? "0",
  ecosystemAmountWei: cycle.ecosystemAmountWei ?? cycle.ecosystem_amount_wei ?? "0",
  reserveAmountWei: cycle.reserveAmountWei ?? cycle.reserve_amount_wei ?? "0",
  l2l3AmountWei: cycle.l2l3AmountWei ?? cycle.l2l3_amount_wei ?? "0",
  epochStart: cycle.epochStart ?? cycle.epoch_start ?? null,
  epochEnd: cycle.epochEnd ?? cycle.epoch_end ?? null,
  executedAt: cycle.executedAt ?? cycle.executed_at ?? null,
  createdAt: cycle.createdAt ?? cycle.created_at ?? new Date().toISOString(),
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "payout-service" }));

app.get("/payouts", async (_req, res) => {
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles`);
    const raw = Array.isArray(upstream?.cycles)
      ? upstream.cycles
      : Array.isArray(upstream?.data)
        ? upstream.data
        : [];
    const statusFilter = req.query.status;
    const payouts = raw.map(cycleToPayoutRecord).filter((p) => !statusFilter || p.status === statusFilter);

    const prometheusTotal = await promQuery("sum(ghost_payout_amount_wei_total)");
    const meta = {
      prometheusTotal: prometheusTotal ?? null,
      cycleCount: payouts.length,
      fetchedAt: new Date().toISOString(),
    };
    res.json({ ok: true, payouts, meta });
  } catch (err) {
    log("warn", "reward-distributor unreachable, returning empty payouts", { error: err?.message });
    res.json({ ok: true, payouts: [], meta: { cycleCount: 0, fetchedAt: new Date().toISOString() } });
  }
});

/** GET /payouts/stats — aggregate payout statistics */
app.get("/payouts/stats", async (_req, res) => {
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles`).catch(() => null);
    const raw = Array.isArray(upstream?.cycles)
      ? upstream.cycles
      : Array.isArray(upstream?.data)
        ? upstream.data
        : [];
    const payouts = raw.map(cycleToPayoutRecord);
    const executedCount = payouts.filter((p) => p.status === "executed").length;
    const pendingCount = payouts.filter((p) => p.status === "pending").length;
    const totalWei = payouts.reduce((sum, p) => sum + BigInt(p.totalAmountWei || "0"), 0n);
    const avgWei = executedCount > 0 ? (totalWei / BigInt(executedCount)).toString() : "0";
    const [promTotal, promPending] = await Promise.all([
      promQuery("sum(ghost_payout_amount_wei_total)"),
      promQuery("ghost_payout_cycles_pending"),
    ]);
    res.json({
      ok: true,
      stats: {
        executedCount,
        pendingCount,
        totalAmountWei: totalWei.toString(),
        avgCycleAmountWei: avgWei,
        prometheusTotal: promTotal,
        prometheusPending: promPending ? Number(promPending) : null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});
app.get("/payouts/summary", async (_req, res) => {
  try {
    const [totalPaid, pendingCount] = await Promise.all([
      promQuery("sum(ghost_payout_amount_wei_total)"),
      promQuery("ghost_payout_cycles_pending"),
    ]);
    res.json({
      ok: true,
      summary: {
        totalPaidWei: totalPaid,
        pendingCycles: pendingCount ? Number(pendingCount) : null,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});
app.get("/payouts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const upstream = await fetchJSON(`${REWARD_DISTRIBUTOR_URL}/v1/reward/cycles/${encodeURIComponent(id)}`);
    const cycle = upstream?.cycle ?? upstream?.data ?? upstream;
    res.json({ ok: true, payout: cycleToPayoutRecord(cycle) });
  } catch (err) {
    log("warn", `cycle ${id} fetch failed`, { error: err?.message });
    res.status(502).json({ ok: false, error: "upstream_unavailable" });
  }
});


app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, () => log("info", `listening on :${PORT}`, { rewardDistributorUrl: REWARD_DISTRIBUTOR_URL }));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
