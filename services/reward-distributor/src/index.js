import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import { verifyGovernanceApproval } from "./governance.js";
import {
  getCycle,
  getFlags,
  insertRewardCycle,
  listCycles,
  markCycleExecuted,
  metricsSnapshot,
  openLedger,
  setFlags
} from "./ledger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7684");
const HOST = process.env.HOST || "0.0.0.0";
const DB_PATH = process.env.DB_PATH || "/data/reward-distributor.sqlite";
const GOVERNANCE_ROOT = process.env.GOVERNANCE_ROOT || "/governance/proposals";
const DISTRIBUTOR_ADMIN_TOKEN = String(process.env.DISTRIBUTOR_ADMIN_TOKEN || "").trim();

const db = openLedger({ dbPath: DB_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.set("json spaces", 0);
app.set("query parser", "simple");
app.set("strict routing", true);
app.set("case sensitive routing", true);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  res.setHeader("Vary", "Accept");
  res.setHeader("Keep-Alive", "timeout=65");
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
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const _RL_WINDOW = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const _RL_MAX    = Number(process.env.RATE_LIMIT_MAX ?? 1000);
const _rlStore   = new Map();
setInterval(() => _rlStore.clear(), _RL_WINDOW).unref();
app.use((req, res, next) => {
  const key = req.ip ?? "unknown";
  const count = (_rlStore.get(key) ?? 0) + 1;
  _rlStore.set(key, count);
  res.setHeader("X-RateLimit-Limit", _RL_MAX);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, _RL_MAX - count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + _RL_WINDOW) / 1000));
  if (count > _RL_MAX) { res.setHeader("Retry-After", Math.ceil(_RL_WINDOW / 1000)); res.setHeader("RateLimit-Policy", `limit=${_RL_MAX};w=${Math.ceil(_RL_WINDOW / 1000)}`); return res.status(429).json({ error: "Too many requests" }); }
  next();
});
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false, parameterLimit: 100 }));
app.use((req, res, next) => {
  if (["POST","PUT","PATCH"].includes(req.method) && req.headers["content-type"] &&
      !req.is(["application/json","application/x-www-form-urlencoded"])) {
    return res.status(415).json({ ok: false, error: "Unsupported Media Type" });
  }
  next();
});
app.use((req, res, next) => {
  if (req.method !== "OPTIONS" && !req.accepts("application/json")) {
    return res.status(406).json({ ok: false, error: "Not Acceptable" });
  }
  next();
});
let _draining = false;
app.use((req, res, next) => { if (_draining) { res.set("Connection","close"); res.setHeader("Retry-After", "5"); return res.status(503).json({ error: "Service shutting down" }); } next(); });
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] ?? crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);
  const t0 = Date.now();
  res.on("prefinish", () => res.setHeader("X-Response-Time", `${Date.now() - t0}ms`));
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0, reqId: req.id, pid: process.pid, mem: process.memoryUsage().rss })));
  next();
});


const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "reward-distributor",
      message,
      ...extra
    })
  );
};

const withAdmin = (req, res, next) => {
  if (!DISTRIBUTOR_ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (token !== DISTRIBUTOR_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const toWei = (value, label) => {
  const amount = BigInt(String(value || "0"));
  if (amount < 0n) throw new Error(`${label}_must_be_non_negative`);
  return amount;
};

const bpsValue = (value, fallback) => {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num) || num < 0 || num > 10_000) {
    throw new Error("invalid_bps");
  }
  return Math.floor(num);
};

const splitRewards = ({ netYieldWei, reserveBps, validatorBps, ecosystemBps, l2l3Bps }) => {
  const totalBps = reserveBps + validatorBps + ecosystemBps + l2l3Bps;
  if (totalBps > 10_000) {
    throw new Error("distribution_bps_exceeds_10000");
  }

  const reserveWei = (netYieldWei * BigInt(reserveBps)) / 10_000n;
  const validatorWei = (netYieldWei * BigInt(validatorBps)) / 10_000n;
  const ecosystemWei = (netYieldWei * BigInt(ecosystemBps)) / 10_000n;
  const l2l3Wei = (netYieldWei * BigInt(l2l3Bps)) / 10_000n;

  const distributed = reserveWei + validatorWei + ecosystemWei + l2l3Wei;
  if (distributed > netYieldWei) {
    throw new Error("distribution_exceeds_net_yield");
  }

  return {
    reserveWei,
    validatorWei,
    ecosystemWei,
    l2l3Wei
  };
};

const normalizeMemberPools = (rawPools) => {
  if (rawPools == null) return [];
  if (!Array.isArray(rawPools)) throw new Error("member_pools_must_be_array");

  const pools = rawPools.map((entry) => {
    const memberId = String(entry?.memberId || "").trim();
    const memberBps = Number(entry?.memberBps ?? 0);
    const compliant = entry?.compliant !== false;
    if (!memberId) throw new Error("member_id_required");
    if (!Number.isFinite(memberBps) || memberBps < 0 || memberBps > 10_000) throw new Error("invalid_member_bps");
    if (!compliant) throw new Error(`member_non_compliant:${memberId}`);
    return {
      memberId,
      memberBps: Math.floor(memberBps),
      compliant: true
    };
  });

  const totalMemberBps = pools.reduce((sum, pool) => sum + pool.memberBps, 0);
  if (totalMemberBps > 10_000) throw new Error("member_pool_bps_exceeds_10000");
  return pools;
};

const formatWei = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num / 1e18;
};

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "reward-distributor",
    flags: getFlags(db),
    queuedCycles: metricsSnapshot(db).queuedCount
  });
});

app.get("/metrics", (_req, res) => {
  const metric = metricsSnapshot(db);
  res.type("text/plain").send(
    [
      "# HELP rewards_distributed_total Total rewards distributed",
      "# TYPE rewards_distributed_total counter",
      `rewards_distributed_total ${formatWei(metric.distributedWei)}`,
      "# HELP validator_rewards Total rewards sent to validators",
      "# TYPE validator_rewards counter",
      `validator_rewards ${formatWei(metric.validatorWei)}`,
      "# HELP ecosystem_incentives Total ecosystem incentives distributed",
      "# TYPE ecosystem_incentives counter",
      `ecosystem_incentives ${formatWei(metric.ecosystemWei)}`,
      "# HELP l3_event_rewards Total L2/L3 incentive rewards distributed",
      "# TYPE l3_event_rewards counter",
      `l3_event_rewards ${formatWei(metric.l2l3Wei)}`,
      "# HELP reward_cycles_queued Number of queued reward cycles",
      "# TYPE reward_cycles_queued gauge",
      `reward_cycles_queued ${metric.queuedCount}`
    ].join("\n")
  );
});

app.get("/v1/reward/cycles", (_req, res) => {
  res.json({ ok: true, cycles: listCycles(db, 200) });
});

app.post("/v1/reward/cycles", withAdmin, (req, res) => {
  try {
    const governanceProposalId = String(req.body?.governanceProposalId || "").trim();
    const governance = verifyGovernanceApproval({
      proposalId: governanceProposalId,
      governanceRoot: GOVERNANCE_ROOT,
      requireQuorumAndTimelock: true
    });

    const flags = getFlags(db);
    if (flags.emergencyHalt) throw new Error("emergency_halt_enabled");
    if (flags.distributionPaused) throw new Error("distribution_paused");

    const netYieldWei = toWei(req.body?.netYieldWei, "net_yield");
    if (netYieldWei <= 0n) throw new Error("net_yield_must_be_positive");

    const reserveBps = bpsValue(req.body?.operationalReserveBps, 2000);
    const validatorBps = bpsValue(req.body?.validatorBps, 3000);
    const ecosystemBps = bpsValue(req.body?.ecosystemBps, 3000);
    const l2l3Bps = bpsValue(req.body?.l2l3Bps, 2000);
    const timelockSeconds = Math.max(0, Number(req.body?.timelockSeconds || 3600));
    const memberPools = normalizeMemberPools(req.body?.memberPools);

    const split = splitRewards({
      netYieldWei,
      reserveBps,
      validatorBps,
      ecosystemBps,
      l2l3Bps
    });

    const cycleId = String(req.body?.cycleId || `reward-${randomUUID()}`);
    const createdAt = new Date();
    const executeAfter = new Date(createdAt.getTime() + timelockSeconds * 1000);

    insertRewardCycle(db, {
      cycleId,
      governanceProposalId,
      netYieldWei: netYieldWei.toString(),
      operationalReserveWei: split.reserveWei.toString(),
      validatorRewardsWei: split.validatorWei.toString(),
      ecosystemIncentivesWei: split.ecosystemWei.toString(),
      l2l3IncentiveWei: split.l2l3Wei.toString(),
      executeAfter: executeAfter.toISOString(),
      createdAt: createdAt.toISOString(),
      status: "queued",
      metadata: {
        governance,
        reserveBps,
        validatorBps,
        ecosystemBps,
        l2l3Bps,
        timelockSeconds,
        memberPools
      }
    });

    log("info", "reward_cycle_queued", {
      cycleId,
      governanceProposalId,
      netYieldWei: netYieldWei.toString(),
      executeAfter: executeAfter.toISOString()
    });

    res.status(202).json({
      ok: true,
      cycleId,
      governance,
      executeAfter: executeAfter.toISOString(),
      split: {
        operationalReserveWei: split.reserveWei.toString(),
        validatorRewardsWei: split.validatorWei.toString(),
        ecosystemIncentivesWei: split.ecosystemWei.toString(),
        l2l3IncentiveWei: split.l2l3Wei.toString()
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "reward_cycle_create_failed" });
  }
});

app.post("/v1/reward/cycles/:cycleId/execute", withAdmin, (req, res) => {
  try {
    const cycleId = String(req.params.cycleId || "").trim();
    if (!cycleId) throw new Error("cycle_id_required");

    const cycle = getCycle(db, cycleId);
    if (!cycle) throw new Error("cycle_not_found");
    if (cycle.status === "executed") throw new Error("cycle_already_executed");

    const governanceProposalId = String(req.body?.governanceProposalId || cycle.governanceProposalId || "").trim();
    verifyGovernanceApproval({ proposalId: governanceProposalId, governanceRoot: GOVERNANCE_ROOT, requireQuorumAndTimelock: true });

    const flags = getFlags(db);
    if (flags.emergencyHalt) throw new Error("emergency_halt_enabled");
    if (flags.distributionPaused) throw new Error("distribution_paused");

    const executeAfter = new Date(cycle.executeAfter);
    if (executeAfter.getTime() > Date.now()) {
      throw new Error("timelock_not_expired");
    }

    const distributed = BigInt(cycle.operationalReserveWei)
      + BigInt(cycle.validatorRewardsWei)
      + BigInt(cycle.ecosystemIncentivesWei)
      + BigInt(cycle.l2l3IncentiveWei);

    if (distributed > BigInt(cycle.netYieldWei)) {
      throw new Error("distribution_exceeds_net_yield");
    }

    const memberPools = Array.isArray(cycle.metadata?.memberPools) ? cycle.metadata.memberPools : [];
    const memberBreakdown = memberPools.map((pool) => {
      const memberBps = Number(pool?.memberBps || 0);
      const amountWei = (BigInt(cycle.l2l3IncentiveWei) * BigInt(memberBps)) / 10_000n;
      return {
        memberId: String(pool?.memberId || ""),
        memberBps,
        amountWei: amountWei.toString()
      };
    });

    const executedAt = new Date().toISOString();
    markCycleExecuted(db, cycleId, executedAt);

    log("info", "reward_cycle_executed", {
      reward_cycle_id: cycleId,
      total_distributed: distributed.toString(),
      breakdown: {
        validator_rewards: cycle.validatorRewardsWei,
        ecosystem_incentives: cycle.ecosystemIncentivesWei,
        l2l3_incentives: cycle.l2l3IncentiveWei,
        member_pools: memberBreakdown
      }
    });

    res.json({
      ok: true,
      reward_cycle_id: cycleId,
      executedAt,
      total_distributed: distributed.toString(),
      breakdown: {
        operational_reserve: cycle.operationalReserveWei,
        validator_rewards: cycle.validatorRewardsWei,
        ecosystem_incentives: cycle.ecosystemIncentivesWei,
        l2l3_event_rewards: cycle.l2l3IncentiveWei,
        member_pools: memberBreakdown
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "reward_cycle_execute_failed" });
  }
});

app.post("/v1/reward/failsafe", withAdmin, (req, res) => {
  try {
    const governanceProposalId = String(req.body?.governanceProposalId || "").trim();
    const governance = verifyGovernanceApproval({ proposalId: governanceProposalId, governanceRoot: GOVERNANCE_ROOT, requireQuorumAndTimelock: true });

    const current = getFlags(db);
    const next = {
      emergencyHalt: req.body?.emergencyHalt == null ? current.emergencyHalt : Boolean(req.body?.emergencyHalt),
      distributionPaused: req.body?.distributionPaused == null ? current.distributionPaused : Boolean(req.body?.distributionPaused)
    };

    setFlags(db, next);
    log("warn", "reward_failsafe_updated", { governanceProposalId, next });

    res.json({ ok: true, governance, flags: getFlags(db) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "reward_failsafe_failed" });
  }
});

app.use((_req, res) => { res.setHeader("Cache-Control", "no-store"); return res.status(404).json({ ok: false, error: "not_found" }); });

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.status === 413 || err.statusCode === 413) return res.status(413).json({ ok: false, error: "Payload too large" });
  if (err.status === 431 || err.statusCode === 431) return res.status(431).json({ ok: false, error: "Request header fields too large" });
  if (err.status === 408 || err.statusCode === 408) return res.status(408).json({ ok: false, error: "Request timeout" });
  if (err.status === 405 || err.statusCode === 405) return res.status(405).json({ ok: false, error: "Method not allowed" });
  const status = err.status ?? err.statusCode ?? 500;
  const _isProd = process.env.NODE_ENV === "production";
  res.setHeader("Cache-Control", "no-store");
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledError", status, error: err?.message ?? String(err), stack: _isProd ? undefined : err?.stack }));
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    host: HOST,
    port: PORT,
    governanceRoot: GOVERNANCE_ROOT
  });
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.timeout = 30_000;
server.maxHeadersCount = 100;
server.requestTimeout = 30_000;
server.on("connection", (socket) => socket.setNoDelay(true));
server.on("error", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "serverError", error: err?.message ?? String(err), code: err?.code }));
  if (err.code === "EADDRINUSE" || err.code === "EACCES") { process.exitCode = 1; process.exit(1); }
});
console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "startup", version: process.env.npm_package_version ?? "unknown" }));
process.setMaxListeners(20);
process.on("warning", (w) => console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "NodeWarning", name: w.name, message: w.message })));
process.on("exit", (code) => { console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "exit", code })); });
process.on("SIGPIPE", () => { /* ignore: client disconnected mid-response */ });
process.on("uncaughtException", (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "uncaughtException", error: err?.message ?? String(err), stack: err?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg: "unhandledRejection", error: String(reason), stack: reason?.stack }));
  process.exitCode = 1; process.exit(1);
});
process.on("SIGTERM", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
process.on("SIGQUIT", () => {
  _draining = true;
  setTimeout(() => { console.error("Shutdown timeout — forcing exit"); process.exit(1); }, 10_000).unref();
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
