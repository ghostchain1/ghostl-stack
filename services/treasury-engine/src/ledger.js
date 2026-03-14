import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_STATE = {
  treasury_total_value_wei: "0",
  treasury_deployed_capital_wei: "0",
  treasury_yield_returned_wei: "0",
  treasury_risk_exposure_bps: "0",
  federation_policy_violations_total: "0",
  solvency_epoch_latest: "0",
  solvency_proof_verified_total: "0",
  solvency_proof_failed_total: "0"
};

export function openLedger({ dbPath, migrationPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(migrationPath, "utf8"));

  for (const [key, value] of Object.entries(DEFAULT_STATE)) {
    db.prepare(`INSERT OR IGNORE INTO treasury_state (key, value) VALUES (?, ?)`).run(key, value);
  }

  return db;
}

export function getState(db, key) {
  const row = db.prepare(`SELECT value FROM treasury_state WHERE key = ?`).get(key);
  if (!row) return null;
  return String(row.value);
}

export function setState(db, key, value) {
  db.prepare(`INSERT INTO treasury_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    String(value)
  );
}

export function getFlags(db) {
  const row = db.prepare(`SELECT emergency_halt, allocation_paused, withdrawal_freeze, updated_at FROM safety_flags WHERE id = 1`).get();
  return {
    emergencyHalt: Number(row?.emergency_halt || 0) === 1,
    allocationPaused: Number(row?.allocation_paused || 0) === 1,
    withdrawalFreeze: Number(row?.withdrawal_freeze || 0) === 1,
    updatedAt: row?.updated_at || null
  };
}

export function setFlags(db, flags) {
  db.prepare(
    `UPDATE safety_flags
        SET emergency_halt = ?,
            allocation_paused = ?,
            withdrawal_freeze = ?,
            updated_at = ?
      WHERE id = 1`
  ).run(flags.emergencyHalt ? 1 : 0, flags.allocationPaused ? 1 : 0, flags.withdrawalFreeze ? 1 : 0, new Date().toISOString());
}

export function insertRevenueBatch(db, row) {
  db.prepare(
    `INSERT INTO revenue_batches (
       batch_id,
       source_layer,
       source_chain_id,
       target_layer,
       target_chain_id,
       gross_wei,
       net_wei,
       ops_fee_wei,
       event_count,
       received_at,
       payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.batchId,
    row.sourceLayer,
    row.sourceChainId,
    row.targetLayer,
    row.targetChainId,
    row.grossWei,
    row.netWei,
    row.opsFeeWei,
    row.eventCount,
    row.receivedAt,
    JSON.stringify(row.payload)
  );
}

export function hasRevenueBatch(db, batchId) {
  const row = db.prepare(`SELECT batch_id FROM revenue_batches WHERE batch_id = ?`).get(batchId);
  return Boolean(row?.batch_id);
}

export function insertAllocation(db, row) {
  db.prepare(
    `INSERT INTO allocations (
       allocation_id,
       governance_proposal_id,
       deployed_amount_wei,
       expected_apy_bps,
       risk_score_bps,
       destination_type,
       destination_chain_id,
       target,
       status,
       created_at,
       executed_at,
       metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.allocationId,
    row.governanceProposalId,
    row.deployedAmountWei,
    row.expectedApyBps,
    row.riskScoreBps,
    row.destinationType,
    row.destinationChainId,
    row.target,
    row.status,
    row.createdAt,
    row.executedAt,
    JSON.stringify(row.metadata)
  );
}

export function insertAllocationRoute(db, row) {
  db.prepare(
    `INSERT INTO allocation_routes (
       route_id,
       allocation_id,
       adapter_id,
       deployed_amount_wei,
       expected_apy_bps,
       risk_score_bps,
       route_status,
       route_error,
       routed_at,
       payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.routeId,
    row.allocationId,
    row.adapterId,
    row.deployedAmountWei,
    row.expectedApyBps,
    row.riskScoreBps,
    row.routeStatus,
    row.routeError,
    row.routedAt,
    JSON.stringify(row.payload)
  );
}

export function insertYieldReturn(db, row) {
  db.prepare(
    `INSERT INTO yield_returns (
       return_id,
       allocation_id,
       amount_wei,
       observed_apy_bps,
       source,
       recorded_at,
       payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.returnId, row.allocationId, row.amountWei, row.observedApyBps, row.source, row.recordedAt, JSON.stringify(row.payload));
}

export function listAllocations(db, limit = 100) {
  return db
    .prepare(
      `SELECT allocation_id,
              governance_proposal_id,
              deployed_amount_wei,
              expected_apy_bps,
              risk_score_bps,
              destination_type,
              destination_chain_id,
              target,
              status,
              created_at,
              executed_at,
              metadata_json
         FROM allocations
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      allocationId: row.allocation_id,
      governanceProposalId: row.governance_proposal_id,
      deployedAmountWei: String(row.deployed_amount_wei),
      expectedApyBps: Number(row.expected_apy_bps),
      riskScoreBps: Number(row.risk_score_bps),
      destinationType: row.destination_type,
      destinationChainId: Number(row.destination_chain_id),
      target: row.target,
      status: row.status,
      createdAt: row.created_at,
      executedAt: row.executed_at,
      metadata: JSON.parse(row.metadata_json)
    }));
}

export function listSnapshotRows(db, limit = 500) {
  const revenue = db
    .prepare(`SELECT batch_id, net_wei, gross_wei, source_chain_id, target_chain_id, received_at FROM revenue_batches ORDER BY received_at DESC LIMIT ?`)
    .all(limit)
    .map((row) => ({
      type: "revenue_batch",
      batchId: row.batch_id,
      netWei: String(row.net_wei),
      grossWei: String(row.gross_wei),
      sourceChainId: Number(row.source_chain_id),
      targetChainId: Number(row.target_chain_id),
      recordedAt: row.received_at
    }));

  const allocations = db
    .prepare(
      `SELECT allocation_id, governance_proposal_id, deployed_amount_wei, risk_score_bps, destination_chain_id, created_at
         FROM allocations
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      type: "allocation",
      allocationId: row.allocation_id,
      governanceProposalId: row.governance_proposal_id,
      deployedAmountWei: String(row.deployed_amount_wei),
      riskScoreBps: Number(row.risk_score_bps),
      destinationChainId: Number(row.destination_chain_id),
      recordedAt: row.created_at
    }));

  const yields = db
    .prepare(`SELECT return_id, allocation_id, amount_wei, observed_apy_bps, source, recorded_at FROM yield_returns ORDER BY recorded_at DESC LIMIT ?`)
    .all(limit)
    .map((row) => ({
      type: "yield_return",
      returnId: row.return_id,
      allocationId: row.allocation_id,
      amountWei: String(row.amount_wei),
      observedApyBps: row.observed_apy_bps === null ? null : Number(row.observed_apy_bps),
      source: row.source,
      recordedAt: row.recorded_at
    }));

  return [...revenue, ...allocations, ...yields].sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
}

export function upsertMemberExposure(db, row) {
  db.prepare(
    `INSERT INTO member_exposure (member_id, policy_version, exposure_wei, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(member_id) DO UPDATE SET
       policy_version = excluded.policy_version,
       exposure_wei = excluded.exposure_wei,
       updated_at = excluded.updated_at`
  ).run(row.memberId, row.policyVersion, row.exposureWei, row.updatedAt);
}

export function listMemberExposure(db) {
  const rows = db
    .prepare(`SELECT member_id, policy_version, exposure_wei, updated_at FROM member_exposure ORDER BY member_id ASC`)
    .all();
  return rows.map((row) => ({
    memberId: row.member_id,
    policyVersion: row.policy_version,
    exposureWei: String(row.exposure_wei),
    updatedAt: row.updated_at
  }));
}

export function insertSolvencySnapshot(db, row) {
  db.prepare(
    `INSERT INTO solvency_snapshots (
       snapshot_id,
       epoch,
       assets_root,
       liabilities_root,
       net_position_root,
       assets_total_wei,
       liabilities_total_wei,
       solvent,
       artifact_path,
       created_at,
       payload_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.snapshotId,
    row.epoch,
    row.assetsRoot,
    row.liabilitiesRoot,
    row.netPositionRoot,
    row.assetsTotalWei,
    row.liabilitiesTotalWei,
    row.solvent ? 1 : 0,
    row.artifactPath,
    row.createdAt,
    JSON.stringify(row.payload)
  );
}

export function getLatestSolvencySnapshot(db) {
  const row = db
    .prepare(
      `SELECT snapshot_id,
              epoch,
              assets_root,
              liabilities_root,
              net_position_root,
              assets_total_wei,
              liabilities_total_wei,
              solvent,
              artifact_path,
              created_at,
              payload_json
         FROM solvency_snapshots
        ORDER BY epoch DESC
        LIMIT 1`
    )
    .get();
  if (!row) return null;
  return {
    snapshotId: row.snapshot_id,
    epoch: Number(row.epoch),
    assetsRoot: row.assets_root,
    liabilitiesRoot: row.liabilities_root,
    netPositionRoot: row.net_position_root,
    assetsTotalWei: String(row.assets_total_wei),
    liabilitiesTotalWei: String(row.liabilities_total_wei),
    solvent: Number(row.solvent) === 1,
    artifactPath: row.artifact_path,
    createdAt: row.created_at,
    payload: JSON.parse(row.payload_json)
  };
}
