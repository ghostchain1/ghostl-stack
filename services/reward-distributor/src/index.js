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
app.use(express.json({ limit: "512kb" }));

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

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    host: HOST,
    port: PORT,
    governanceRoot: GOVERNANCE_ROOT
  });
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
