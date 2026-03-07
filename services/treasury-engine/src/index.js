import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";

import {
  getFlags,
  getState,
  hasRevenueBatch,
  insertAllocation,
  insertAllocationRoute,
  insertRevenueBatch,
  insertSolvencySnapshot,
  insertYieldReturn,
  getLatestSolvencySnapshot,
  listAllocations,
  listMemberExposure,
  listSnapshotRows,
  openLedger,
  setFlags,
  setState,
  upsertMemberExposure
} from "./ledger.js";
import { verifyGovernanceApproval } from "./governance.js";
import { buildMerkleRoot } from "./merkle.js";
import { deterministicRiskScore, simulateAllocation } from "./risk.js";
import { computeNetPositionRoot, snapshotAssets, snapshotLiabilities } from "./solvency/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || "7683");
const HOST = process.env.HOST || "0.0.0.0";
const SERVICE_LAYER = String(process.env.SERVICE_LAYER || "L1").trim().toUpperCase();

const L1_CHAIN_ID = Number(process.env.L1_CHAIN_ID || "14000101");
const L2_CHAIN_ID = Number(process.env.L2_CHAIN_ID || "901");

const DB_PATH = process.env.DB_PATH || "/data/treasury-engine.sqlite";
const PROOF_DIR = process.env.PROOF_DIR || "/data/proofs";
const SOLVENCY_ARTIFACT_DIR = process.env.SOLVENCY_ARTIFACT_DIR || "/artifacts/solvency";
const SOLVENCY_ARTIFACT_SIGNING_KEY = String(process.env.SOLVENCY_ARTIFACT_SIGNING_KEY || "").trim();
const GOVERNANCE_ROOT = process.env.GOVERNANCE_ROOT || "/governance/proposals";
const TREASURY_ADMIN_TOKEN = String(process.env.TREASURY_ADMIN_TOKEN || "").trim();
const ROUTE_TIMEOUT_MS = Math.max(500, Number(process.env.ROUTE_TIMEOUT_MS || "5000"));

const DEFAULT_STABLE_ASSET_RATIO = Number(process.env.STABLE_ASSET_RATIO || "65");
const DEFAULT_YIELD_RATIO = Number(process.env.YIELD_RATIO || "35");
const DEFAULT_RISK_CAP_BPS = Number(process.env.RISK_CAP_BPS || "7200");
const FEDERATION_POLICY_PATH = String(process.env.FEDERATION_POLICY_PATH || "").trim();

const YIELD_ADAPTERS = (() => {
  const raw = String(process.env.YIELD_ADAPTERS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === "object");
  } catch {
    return [];
  }
})();

const federationPolicy = (() => {
  if (!FEDERATION_POLICY_PATH) return null;
  try {
    const content = fs.readFileSync(FEDERATION_POLICY_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
})();

if (SERVICE_LAYER !== "L1") {
  throw new Error("treasury_engine_must_run_on_l1");
}

fs.mkdirSync(PROOF_DIR, { recursive: true });
fs.mkdirSync(SOLVENCY_ARTIFACT_DIR, { recursive: true });
const db = openLedger({ dbPath: DB_PATH, migrationPath: path.join(__dirname, "..", "migrations", "0001_init.sql") });

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - t0 })));
  next();
});


const log = (level, message, extra = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: "treasury-engine",
      message,
      ...extra
    })
  );
};

const getBig = (key) => BigInt(String(getState(db, key) || "0"));
const setBig = (key, value) => setState(db, key, BigInt(value).toString());

const treasurySnapshot = () => {
  const totalValueWei = getBig("treasury_total_value_wei");
  const deployedCapitalWei = getBig("treasury_deployed_capital_wei");
  const yieldReturnedWei = getBig("treasury_yield_returned_wei");
  const riskExposureBps = Number(getState(db, "treasury_risk_exposure_bps") || "0");
  const availableWei = totalValueWei > deployedCapitalWei ? totalValueWei - deployedCapitalWei : 0n;

  return {
    totalValueWei,
    deployedCapitalWei,
    yieldReturnedWei,
    availableWei,
    riskExposureBps
  };
};

const serializeSnapshot = (snapshot) => ({
  totalValueWei: snapshot.totalValueWei.toString(),
  deployedCapitalWei: snapshot.deployedCapitalWei.toString(),
  yieldReturnedWei: snapshot.yieldReturnedWei.toString(),
  availableWei: snapshot.availableWei.toString(),
  riskExposureBps: snapshot.riskExposureBps
});

const formatWei = (wei) => {
  const num = Number(wei);
  if (!Number.isFinite(num)) return 0;
  return num / 1e18;
};

const incrementFederationViolation = () => {
  const current = Number(getState(db, "federation_policy_violations_total") || "0");
  setState(db, "federation_policy_violations_total", String(current + 1));
};

const federationMembersActive = () => {
  if (!federationPolicy || typeof federationPolicy !== "object") return 0;
  const members = federationPolicy?.members;
  if (!members || typeof members !== "object") return 0;
  return Object.values(members).filter((member) => String(member?.status || "").toLowerCase() === "active").length;
};

const validateFederationAllocation = ({ memberContext, policyVersion, destinationChainId, riskScoreBps, exposureBps }) => {
  if (!federationPolicy) return { ok: true, memberId: null };

  if (!memberContext || typeof memberContext !== "object") {
    incrementFederationViolation();
    throw new Error("member_context_required_for_federated_policy");
  }
  const memberId = String(memberContext.memberId || "").trim();
  if (!memberId) {
    incrementFederationViolation();
    throw new Error("member_id_required_for_federated_policy");
  }

  const configuredVersion = String(federationPolicy.policyVersion || "federation-v1");
  if (policyVersion && String(policyVersion) !== configuredVersion) {
    incrementFederationViolation();
    throw new Error("policy_version_mismatch");
  }

  const members = federationPolicy.members || {};
  const member = members?.[memberId];
  if (!member) {
    incrementFederationViolation();
    throw new Error("member_not_registered");
  }

  const status = String(member.status || "inactive").toLowerCase();
  if (status !== "active") {
    incrementFederationViolation();
    throw new Error("member_non_compliant");
  }

  const allowedChains = Array.isArray(member.allowedDestinationChainIds) ? member.allowedDestinationChainIds.map((id) => Number(id)) : [];
  if (allowedChains.length > 0 && !allowedChains.includes(Number(destinationChainId))) {
    incrementFederationViolation();
    throw new Error("destination_chain_not_allowed_for_member");
  }

  const memberRiskCap = Number(member.riskCapBps || DEFAULT_RISK_CAP_BPS);
  if (riskScoreBps > memberRiskCap) {
    incrementFederationViolation();
    throw new Error("member_risk_cap_exceeded");
  }

  const memberExposureCap = Number(member.maxExposureBps || 10_000);
  if (exposureBps > memberExposureCap) {
    incrementFederationViolation();
    throw new Error("member_exposure_cap_exceeded");
  }

  return { ok: true, memberId, configuredVersion };
};

const signSolvencyArtifact = (payload) => {
  if (!SOLVENCY_ARTIFACT_SIGNING_KEY) return null;
  return crypto.createHmac("sha256", SOLVENCY_ARTIFACT_SIGNING_KEY).update(payload).digest("hex");
};

const withAdmin = (req, res, next) => {
  if (!TREASURY_ADMIN_TOKEN) return next();
  const token = String(req.header("x-admin-token") || "").trim();
  if (token !== TREASURY_ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
};

const requireGovernance = (proposalId, requireQuorumAndTimelock = true) => {
  return verifyGovernanceApproval({
    proposalId,
    governanceRoot: GOVERNANCE_ROOT,
    requireQuorumAndTimelock
  });
};

const chooseAdapter = (destinationType) => {
  const match = YIELD_ADAPTERS.find((entry) => String(entry.type || "").toLowerCase() === String(destinationType || "").toLowerCase());
  if (!match) return null;
  return {
    id: String(match.id || `adapter-${destinationType}`),
    type: String(match.type || destinationType),
    url: String(match.url || "").replace(/\/+$/, ""),
    enabled: match.enabled !== false
  };
};

const routeAllocation = async ({ allocationId, destinationType, deployedAmountWei, expectedApyBps, riskScoreBps, governanceProof }) => {
  const adapter = chooseAdapter(destinationType);
  const baseRoute = {
    routeId: `route-${randomUUID()}`,
    allocationId,
    adapterId: adapter?.id || null,
    deployedAmountWei,
    expectedApyBps,
    riskScoreBps,
    routedAt: new Date().toISOString()
  };

  if (!adapter || !adapter.enabled || !adapter.url) {
    return {
      ...baseRoute,
      routeStatus: "simulated",
      routeError: null,
      payload: {
        mode: "simulated",
        adapter,
        governanceProof
      }
    };
  }

  const payload = {
    allocationId,
    deployedAmountWei,
    expectedApyBps,
    riskScoreBps,
    governanceProposalId: governanceProof.proposalId,
    approvedBy: governanceProof.approvedBy
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const response = await fetch(`${adapter.url}/v1/deploy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ...baseRoute,
        routeStatus: "failed",
        routeError: String(body?.error || `http_${response.status}`),
        payload: { adapter, request: payload, response: body, status: response.status }
      };
    }

    return {
      ...baseRoute,
      routeStatus: "executed",
      routeError: null,
      payload: { adapter, request: payload, response: body, status: response.status }
    };
  } catch (error) {
    return {
      ...baseRoute,
      routeStatus: "failed",
      routeError: error instanceof Error ? error.message : "route_error",
      payload: { adapter, request: payload }
    };
  } finally {
    clearTimeout(timeout);
  }
};

app.get("/health", (_req, res) => {
  const flags = getFlags(db);
  const snapshot = treasurySnapshot();
  res.json({
    ok: true,
    service: "treasury-engine",
    layer: SERVICE_LAYER,
    chainId: L1_CHAIN_ID,
    flags,
    treasury: {
      totalValueWei: snapshot.totalValueWei.toString(),
      deployedCapitalWei: snapshot.deployedCapitalWei.toString(),
      availableWei: snapshot.availableWei.toString(),
      riskExposureBps: snapshot.riskExposureBps
    },
    solvency: {
      latestEpoch: Number(getState(db, "solvency_epoch_latest") || "0")
    }
  });
});

app.get("/metrics", (_req, res) => {
  const snapshot = treasurySnapshot();
  const exposures = listMemberExposure(db);
  const federationViolations = Number(getState(db, "federation_policy_violations_total") || "0");
  const solvencyEpochLatest = Number(getState(db, "solvency_epoch_latest") || "0");
  const solvencyProofVerifiedTotal = Number(getState(db, "solvency_proof_verified_total") || "0");
  const solvencyProofFailedTotal = Number(getState(db, "solvency_proof_failed_total") || "0");
  const exposureLines = exposures.map(
    (row) =>
      `treasury_exposure_by_member{member_id="${row.memberId}",policy_version="${row.policyVersion}"} ${formatWei(BigInt(row.exposureWei))}`
  );
  res.type("text/plain").send(
    [
      "# HELP treasury_total_value Total treasury value",
      "# TYPE treasury_total_value gauge",
      `treasury_total_value ${formatWei(snapshot.totalValueWei)}`,
      "# HELP treasury_deployed_capital Total externally deployed capital",
      "# TYPE treasury_deployed_capital gauge",
      `treasury_deployed_capital ${formatWei(snapshot.deployedCapitalWei)}`,
      "# HELP treasury_yield_returned Total yield returned",
      "# TYPE treasury_yield_returned counter",
      `treasury_yield_returned ${formatWei(snapshot.yieldReturnedWei)}`,
      "# HELP treasury_risk_exposure Treasury risk exposure score",
      "# TYPE treasury_risk_exposure gauge",
      `treasury_risk_exposure ${snapshot.riskExposureBps}`,
      "# HELP federation_members_active Number of active federation members",
      "# TYPE federation_members_active gauge",
      `federation_members_active ${federationMembersActive()}`,
      "# HELP policy_violations_total Number of rejected policy validations",
      "# TYPE policy_violations_total counter",
      `policy_violations_total ${federationViolations}`,
      "# HELP treasury_exposure_by_member Member-level treasury exposure",
      "# TYPE treasury_exposure_by_member gauge",
      ...exposureLines,
      "# HELP solvency_epoch_latest Latest solvency epoch",
      "# TYPE solvency_epoch_latest gauge",
      `solvency_epoch_latest ${solvencyEpochLatest}`,
      "# HELP solvency_proof_verified_total Count of verified solvency proofs",
      "# TYPE solvency_proof_verified_total counter",
      `solvency_proof_verified_total ${solvencyProofVerifiedTotal}`,
      "# HELP solvency_proof_failed_total Count of failed solvency proofs",
      "# TYPE solvency_proof_failed_total counter",
      `solvency_proof_failed_total ${solvencyProofFailedTotal}`
    ].join("\n")
  );
});

app.get("/v1/treasury/status", (_req, res) => {
  const flags = getFlags(db);
  const snapshot = treasurySnapshot();
  res.json({
    ok: true,
    layer: SERVICE_LAYER,
    chainId: L1_CHAIN_ID,
    flags,
    treasury: serializeSnapshot(snapshot),
    federation: {
      policyVersion: federationPolicy?.policyVersion || null,
      membersActive: federationMembersActive(),
      violationsTotal: Number(getState(db, "federation_policy_violations_total") || "0")
    }
  });
});

app.post("/v1/treasury/revenue-intake", (req, res) => {
  try {
    const batchId = String(req.body?.batchId || "").trim();
    if (!batchId) {
      throw new Error("batch_id_required");
    }
    if (hasRevenueBatch(db, batchId)) {
      res.status(200).json({ ok: true, duplicate: true, batchId });
      return;
    }

    const sourceLayer = String(req.body?.sourceLayer || "").trim().toUpperCase();
    const sourceChainId = Number(req.body?.sourceChainId);
    const targetLayer = String(req.body?.targetLayer || "").trim().toUpperCase();
    const targetChainId = Number(req.body?.targetChainId);

    if (sourceLayer !== "L2" || sourceChainId !== L2_CHAIN_ID) {
      throw new Error("routing_violation_only_l2_can_forward_revenue");
    }
    if (targetLayer !== "L1" || targetChainId !== L1_CHAIN_ID) {
      throw new Error("routing_violation_l2_must_target_l1_treasury");
    }

    const totals = req.body?.totals || {};
    const grossWei = BigInt(String(totals.grossWei || "0"));
    const netWei = BigInt(String(totals.netWei || "0"));
    const opsFeeWei = BigInt(String(totals.opsFeeWei || "0"));
    if (grossWei <= 0n || netWei <= 0n) {
      throw new Error("revenue_amount_must_be_positive");
    }

    insertRevenueBatch(db, {
      batchId,
      sourceLayer,
      sourceChainId,
      targetLayer,
      targetChainId,
      grossWei: grossWei.toString(),
      netWei: netWei.toString(),
      opsFeeWei: opsFeeWei.toString(),
      eventCount: Array.isArray(req.body?.events) ? req.body.events.length : 0,
      receivedAt: new Date().toISOString(),
      payload: req.body || {}
    });

    const current = treasurySnapshot();
    setBig("treasury_total_value_wei", current.totalValueWei + netWei);

    log("info", "revenue_batch_received", {
      batchId,
      sourceLayer,
      sourceChainId,
      netWei: netWei.toString(),
      grossWei: grossWei.toString()
    });

    const next = treasurySnapshot();
    res.status(202).json({
      ok: true,
      batchId,
      treasury: {
        totalValueWei: next.totalValueWei.toString(),
        availableWei: next.availableWei.toString()
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "revenue_intake_failed" });
  }
});

app.post("/v1/treasury/allocation/simulate", (req, res) => {
  try {
    const snapshot = treasurySnapshot();
    const principalWei = BigInt(String(req.body?.principalWei || snapshot.availableWei.toString()));

    const simulation = simulateAllocation({
      principalWei,
      stableAssetRatio: Number(req.body?.stable_asset_ratio ?? DEFAULT_STABLE_ASSET_RATIO),
      yieldRatio: Number(req.body?.yield_ratio ?? DEFAULT_YIELD_RATIO),
      riskCapBps: Number(req.body?.risk_cap ?? DEFAULT_RISK_CAP_BPS),
      strategy: String(req.body?.strategy || "balanced")
    });

    res.json({ ok: true, simulation });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "simulation_failed" });
  }
});

app.post("/v1/treasury/allocation/execute", async (req, res) => {
  try {
    const flags = getFlags(db);
    if (flags.emergencyHalt) throw new Error("emergency_halt_enabled");
    if (flags.allocationPaused) throw new Error("allocation_paused");

    const governanceProposalId = String(req.body?.governanceProposalId || "").trim();
    const governance = requireGovernance(governanceProposalId, true);

    const snapshot = treasurySnapshot();
    const deployedAmountWei = BigInt(String(req.body?.deployedAmountWei || req.body?.principalWei || "0"));
    if (deployedAmountWei <= 0n) {
      throw new Error("deployed_amount_required");
    }
    if (deployedAmountWei > snapshot.availableWei) {
      throw new Error("insufficient_available_treasury_balance");
    }

    const destinationType = String(req.body?.destinationType || "validator_staking").trim();
    const destinationChainId = Number(req.body?.destinationChainId || L1_CHAIN_ID);
    const target = String(req.body?.target || "l1:yields").trim();

    const riskScoreBps = Number(req.body?.riskScoreBps || deterministicRiskScore({
      deployedAmountWei: deployedAmountWei.toString(),
      destinationType,
      destinationChainId,
      target,
      governanceProposalId
    }));

    const expectedApyBps = Math.max(50, Number(req.body?.expectedApyBps || 650));
    const allocationId = String(req.body?.allocationId || `alloc-${randomUUID()}`);
    const policyVersion = String(req.body?.policyVersion || "").trim();
    const memberContext = req.body?.memberContext;

    const treasuryBase = snapshot.totalValueWei > 0n ? snapshot.totalValueWei : snapshot.availableWei + snapshot.deployedCapitalWei;
    const exposureBps = treasuryBase > 0n ? Number((deployedAmountWei * 10_000n) / treasuryBase) : 0;
    const federationCheck = validateFederationAllocation({
      memberContext,
      policyVersion,
      destinationChainId,
      riskScoreBps,
      exposureBps
    });
    const memberId = federationCheck.memberId;

    const route = await routeAllocation({
      allocationId,
      destinationType,
      deployedAmountWei: deployedAmountWei.toString(),
      expectedApyBps,
      riskScoreBps,
      governanceProof: governance
    });

    const createdAt = new Date().toISOString();
    const status = route.routeStatus === "failed" ? "route_failed" : "executed";

    insertAllocation(db, {
      allocationId,
      governanceProposalId,
      deployedAmountWei: deployedAmountWei.toString(),
      expectedApyBps,
      riskScoreBps,
      destinationType,
      destinationChainId,
      target,
      status,
      createdAt,
      executedAt: status === "executed" ? createdAt : null,
      metadata: {
        source: "treasury-engine",
        governance,
        policyVersion: federationCheck.configuredVersion || policyVersion || null,
        memberContext: memberId ? { memberId, exposureBps } : null,
        routeStatus: route.routeStatus,
        routeError: route.routeError
      }
    });

    insertAllocationRoute(db, {
      routeId: route.routeId,
      allocationId,
      adapterId: route.adapterId,
      deployedAmountWei: route.deployedAmountWei,
      expectedApyBps: route.expectedApyBps,
      riskScoreBps: route.riskScoreBps,
      routeStatus: route.routeStatus,
      routeError: route.routeError,
      routedAt: route.routedAt,
      payload: route.payload
    });

    const oldDeployed = snapshot.deployedCapitalWei;
    const newDeployed = oldDeployed + deployedAmountWei;
    setBig("treasury_deployed_capital_wei", newDeployed);

    const oldRisk = BigInt(snapshot.riskExposureBps);
    const weightedRisk = newDeployed === 0n
      ? 0n
      : ((oldRisk * oldDeployed) + (BigInt(riskScoreBps) * deployedAmountWei)) / newDeployed;
    setState(db, "treasury_risk_exposure_bps", Number(weightedRisk).toString());

    if (memberId) {
      const currentExposure = listMemberExposure(db).find((row) => row.memberId === memberId);
      const nextExposure = BigInt(currentExposure?.exposureWei || "0") + deployedAmountWei;
      upsertMemberExposure(db, {
        memberId,
        policyVersion: federationCheck.configuredVersion || policyVersion || "federation-v1",
        exposureWei: nextExposure.toString(),
        updatedAt: new Date().toISOString()
      });
    }

    log("info", "allocation_executed", {
      allocationId,
      governanceProposalId,
      deployedAmountWei: deployedAmountWei.toString(),
      expectedApyBps,
      riskScoreBps,
      destinationType,
      destinationChainId,
      routeStatus: route.routeStatus
    });

    const next = treasurySnapshot();
    res.status(202).json({
      ok: true,
      allocation: {
        allocationId,
        governanceProposalId,
        deployedAmountWei: deployedAmountWei.toString(),
        expectedApyBps,
        riskScoreBps,
        destinationType,
        destinationChainId,
        target,
        policyVersion: federationCheck.configuredVersion || policyVersion || null,
        memberId,
        status
      },
      route,
      treasury: serializeSnapshot(next)
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "allocation_execution_failed" });
  }
});

app.post("/v1/treasury/yield/record", withAdmin, (req, res) => {
  try {
    const allocationId = String(req.body?.allocationId || "").trim();
    if (!allocationId) throw new Error("allocation_id_required");

    const amountWei = BigInt(String(req.body?.amountWei || "0"));
    if (amountWei <= 0n) throw new Error("yield_amount_must_be_positive");

    const returnId = String(req.body?.returnId || `yield-${randomUUID()}`);
    const observedApyBps = req.body?.observedApyBps == null ? null : Number(req.body?.observedApyBps);
    const source = String(req.body?.source || "yield-router");

    insertYieldReturn(db, {
      returnId,
      allocationId,
      amountWei: amountWei.toString(),
      observedApyBps,
      source,
      recordedAt: new Date().toISOString(),
      payload: req.body || {}
    });

    const snap = treasurySnapshot();
    setBig("treasury_total_value_wei", snap.totalValueWei + amountWei);
    setBig("treasury_yield_returned_wei", snap.yieldReturnedWei + amountWei);

    log("info", "yield_recorded", { returnId, allocationId, amountWei: amountWei.toString(), source });

    res.status(202).json({ ok: true, returnId, allocationId, amountWei: amountWei.toString() });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "yield_record_failed" });
  }
});

app.post("/v1/treasury/failsafe", withAdmin, (req, res) => {
  try {
    const governanceProposalId = String(req.body?.governanceProposalId || "").trim();
    const governance = requireGovernance(governanceProposalId, true);

    const current = getFlags(db);
    const next = {
      emergencyHalt: req.body?.emergencyHalt == null ? current.emergencyHalt : Boolean(req.body?.emergencyHalt),
      allocationPaused: req.body?.allocationPaused == null ? current.allocationPaused : Boolean(req.body?.allocationPaused),
      withdrawalFreeze: req.body?.withdrawalFreeze == null ? current.withdrawalFreeze : Boolean(req.body?.withdrawalFreeze)
    };

    setFlags(db, next);
    log("warn", "failsafe_updated", { governanceProposalId, next });

    res.json({ ok: true, governance, flags: getFlags(db) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "failsafe_update_failed" });
  }
});

app.get("/v1/allocation/history", (_req, res) => {
  res.json({ ok: true, allocations: listAllocations(db, 200) });
});

app.get("/v1/treasury/federation", (_req, res) => {
  const members = listMemberExposure(db);
  res.json({
    ok: true,
    policyVersion: federationPolicy?.policyVersion || null,
    membersActive: federationMembersActive(),
    violationsTotal: Number(getState(db, "federation_policy_violations_total") || "0"),
    exposureByMember: members
  });
});

app.post("/v1/treasury/solvency/snapshot", withAdmin, (req, res) => {
  try {
    const governanceProposalId = String(req.body?.governanceProposalId || "").trim();
    if (governanceProposalId) {
      requireGovernance(governanceProposalId, true);
    }

    const latest = getLatestSolvencySnapshot(db);
    const epoch = Number(req.body?.epoch || (latest?.epoch || 0) + 1);
    if (!Number.isFinite(epoch) || epoch <= 0) throw new Error("invalid_epoch");
    if (latest && epoch <= latest.epoch) throw new Error("epoch_must_increase");

    const snapshot = treasurySnapshot();
    const memberExposure = listMemberExposure(db);
    const assets = snapshotAssets({
      treasury: {
        totalValueWei: snapshot.totalValueWei.toString(),
        availableWei: snapshot.availableWei.toString()
      },
      memberExposure,
      externalAssets: Array.isArray(req.body?.externalAssets) ? req.body.externalAssets : []
    });
    const liabilities = snapshotLiabilities({
      treasury: {
        deployedCapitalWei: snapshot.deployedCapitalWei.toString()
      },
      pendingRewardsWei: String(req.body?.pendingRewardsWei || "0"),
      externalLiabilities: Array.isArray(req.body?.externalLiabilities) ? req.body.externalLiabilities : []
    });

    const netPositionRoot = computeNetPositionRoot({
      assetsRoot: assets.root,
      liabilitiesRoot: liabilities.root,
      assetsTotalWei: assets.totalWei,
      liabilitiesTotalWei: liabilities.totalWei,
      epoch
    });

    const payload = {
      epoch,
      generatedAt: new Date().toISOString(),
      assetsRoot: assets.root,
      liabilitiesRoot: liabilities.root,
      netPositionRoot,
      assetsTotalWei: assets.totalWei.toString(),
      liabilitiesTotalWei: liabilities.totalWei.toString(),
      solvent: assets.totalWei >= liabilities.totalWei,
      assets: assets.entries,
      liabilities: liabilities.entries
    };
    const payloadString = JSON.stringify(payload, null, 2);
    const signature = signSolvencyArtifact(payloadString);

    const artifactName = `solvency-epoch-${String(epoch).padStart(6, "0")}.json`;
    const artifactPath = path.join(SOLVENCY_ARTIFACT_DIR, artifactName);
    const signedPayload = {
      ...payload,
      signature
    };
    fs.writeFileSync(artifactPath, JSON.stringify(signedPayload, null, 2));

    const snapshotId = `solvency-${epoch}-${randomUUID()}`;
    insertSolvencySnapshot(db, {
      snapshotId,
      epoch,
      assetsRoot: assets.root,
      liabilitiesRoot: liabilities.root,
      netPositionRoot,
      assetsTotalWei: assets.totalWei.toString(),
      liabilitiesTotalWei: liabilities.totalWei.toString(),
      solvent: assets.totalWei >= liabilities.totalWei,
      artifactPath,
      createdAt: payload.generatedAt,
      payload: signedPayload
    });

    setState(db, "solvency_epoch_latest", String(epoch));

    log("info", "solvency_snapshot_created", {
      snapshotId,
      epoch,
      assetsRoot: assets.root,
      liabilitiesRoot: liabilities.root,
      netPositionRoot,
      solvent: assets.totalWei >= liabilities.totalWei
    });

    res.status(201).json({
      ok: true,
      snapshotId,
      epoch,
      artifactPath,
      assetsRoot: assets.root,
      liabilitiesRoot: liabilities.root,
      netPositionRoot,
      solvent: assets.totalWei >= liabilities.totalWei
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "solvency_snapshot_failed" });
  }
});

app.post("/v1/treasury/solvency/verify", withAdmin, (req, res) => {
  try {
    const epoch = Number(req.body?.epoch || 0);
    if (!Number.isFinite(epoch) || epoch <= 0) throw new Error("invalid_epoch");
    const latest = getLatestSolvencySnapshot(db);
    if (!latest || latest.epoch !== epoch) throw new Error("snapshot_not_found");

    const proof = req.body?.proof;
    const proofValid = typeof proof === "string" && proof.length > 8;
    const rootsMatch = String(req.body?.assetsRoot || latest.assetsRoot) === latest.assetsRoot
      && String(req.body?.liabilitiesRoot || latest.liabilitiesRoot) === latest.liabilitiesRoot;
    const verified = proofValid && rootsMatch && latest.solvent;

    const verifiedCount = Number(getState(db, "solvency_proof_verified_total") || "0");
    const failedCount = Number(getState(db, "solvency_proof_failed_total") || "0");
    if (verified) {
      setState(db, "solvency_proof_verified_total", String(verifiedCount + 1));
    } else {
      setState(db, "solvency_proof_failed_total", String(failedCount + 1));
    }

    res.json({
      ok: true,
      epoch,
      verified,
      rootsMatch,
      solvent: latest.solvent
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "solvency_verify_failed" });
  }
});

app.get("/v1/treasury/solvency/latest", (_req, res) => {
  const latest = getLatestSolvencySnapshot(db);
  if (!latest) {
    res.json({
      ok: true,
      latest: null
    });
    return;
  }
  res.json({
    ok: true,
    latest
  });
});

app.get("/v1/treasury/proof", (_req, res) => {
  const rows = listSnapshotRows(db, 1000);
  const merkle = buildMerkleRoot(rows);
  const snapshotState = treasurySnapshot();
  const snapshot = {
    generatedAt: new Date().toISOString(),
    layer: SERVICE_LAYER,
    chainId: L1_CHAIN_ID,
    treasury: serializeSnapshot(snapshotState),
    merkle,
    entryCount: rows.length,
    entries: rows
  };

  const filename = `treasury-proof-${Date.now()}.json`;
  const filePath = path.join(PROOF_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

  res.json({ ok: true, file: filePath, root: merkle.root, entryCount: rows.length, generatedAt: snapshot.generatedAt });
});

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ ok: false, error: err?.message ?? String(err) });
});

const server = app.listen(PORT, HOST, () => {
  log("info", "service_started", {
    host: HOST,
    port: PORT,
    serviceLayer: SERVICE_LAYER,
    l1ChainId: L1_CHAIN_ID,
    l2ChainId: L2_CHAIN_ID,
    governanceRoot: GOVERNANCE_ROOT,
    proofDir: PROOF_DIR,
    solvencyArtifactDir: SOLVENCY_ARTIFACT_DIR,
    configuredAdapters: YIELD_ADAPTERS.length,
    federationPolicyPath: FEDERATION_POLICY_PATH || null
  });
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
