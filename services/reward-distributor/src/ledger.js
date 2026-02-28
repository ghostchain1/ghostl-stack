import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openLedger({ dbPath, migrationPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(migrationPath, "utf8"));
  return db;
}

export function insertRewardCycle(db, row) {
  db.prepare(
    `INSERT INTO reward_cycles (
       cycle_id,
       governance_proposal_id,
       net_yield_wei,
       operational_reserve_wei,
       validator_rewards_wei,
       ecosystem_incentives_wei,
       l2l3_incentive_wei,
       execute_after,
       created_at,
       executed_at,
       status,
       metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    row.cycleId,
    row.governanceProposalId,
    row.netYieldWei,
    row.operationalReserveWei,
    row.validatorRewardsWei,
    row.ecosystemIncentivesWei,
    row.l2l3IncentiveWei,
    row.executeAfter,
    row.createdAt,
    row.status,
    JSON.stringify(row.metadata)
  );
}

export function getCycle(db, cycleId) {
  const row = db
    .prepare(
      `SELECT cycle_id,
              governance_proposal_id,
              net_yield_wei,
              operational_reserve_wei,
              validator_rewards_wei,
              ecosystem_incentives_wei,
              l2l3_incentive_wei,
              execute_after,
              created_at,
              executed_at,
              status,
              metadata_json
         FROM reward_cycles
        WHERE cycle_id = ?`
    )
    .get(cycleId);
  if (!row) return null;
  return {
    cycleId: row.cycle_id,
    governanceProposalId: row.governance_proposal_id,
    netYieldWei: String(row.net_yield_wei),
    operationalReserveWei: String(row.operational_reserve_wei),
    validatorRewardsWei: String(row.validator_rewards_wei),
    ecosystemIncentivesWei: String(row.ecosystem_incentives_wei),
    l2l3IncentiveWei: String(row.l2l3_incentive_wei),
    executeAfter: row.execute_after,
    createdAt: row.created_at,
    executedAt: row.executed_at,
    status: row.status,
    metadata: JSON.parse(row.metadata_json)
  };
}

export function listCycles(db, limit = 100) {
  return db
    .prepare(
      `SELECT cycle_id,
              governance_proposal_id,
              net_yield_wei,
              operational_reserve_wei,
              validator_rewards_wei,
              ecosystem_incentives_wei,
              l2l3_incentive_wei,
              execute_after,
              created_at,
              executed_at,
              status,
              metadata_json
         FROM reward_cycles
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(limit)
    .map((row) => ({
      cycleId: row.cycle_id,
      governanceProposalId: row.governance_proposal_id,
      netYieldWei: String(row.net_yield_wei),
      operationalReserveWei: String(row.operational_reserve_wei),
      validatorRewardsWei: String(row.validator_rewards_wei),
      ecosystemIncentivesWei: String(row.ecosystem_incentives_wei),
      l2l3IncentiveWei: String(row.l2l3_incentive_wei),
      executeAfter: row.execute_after,
      createdAt: row.created_at,
      executedAt: row.executed_at,
      status: row.status,
      metadata: JSON.parse(row.metadata_json)
    }));
}

export function markCycleExecuted(db, cycleId, executedAt) {
  db.prepare(`UPDATE reward_cycles SET status = 'executed', executed_at = ? WHERE cycle_id = ?`).run(executedAt, cycleId);
}

export function getFlags(db) {
  const row = db
    .prepare(`SELECT emergency_halt, distribution_paused, updated_at FROM distributor_flags WHERE id = 1`)
    .get();
  return {
    emergencyHalt: Number(row?.emergency_halt || 0) === 1,
    distributionPaused: Number(row?.distribution_paused || 0) === 1,
    updatedAt: row?.updated_at || null
  };
}

export function setFlags(db, flags) {
  db.prepare(
    `UPDATE distributor_flags
        SET emergency_halt = ?,
            distribution_paused = ?,
            updated_at = ?
      WHERE id = 1`
  ).run(flags.emergencyHalt ? 1 : 0, flags.distributionPaused ? 1 : 0, new Date().toISOString());
}

export function metricsSnapshot(db) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status='executed' THEN CAST(validator_rewards_wei AS REAL) ELSE 0 END), 0) AS validator_wei,
         COALESCE(SUM(CASE WHEN status='executed' THEN CAST(ecosystem_incentives_wei AS REAL) ELSE 0 END), 0) AS ecosystem_wei,
         COALESCE(SUM(CASE WHEN status='executed' THEN CAST(l2l3_incentive_wei AS REAL) ELSE 0 END), 0) AS l2l3_wei,
         COALESCE(SUM(CASE WHEN status='executed' THEN CAST(net_yield_wei AS REAL) ELSE 0 END), 0) AS distributed_wei,
         SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued_count
       FROM reward_cycles`
    )
    .get();

  return {
    validatorWei: BigInt(Math.floor(Number(row?.validator_wei || 0))),
    ecosystemWei: BigInt(Math.floor(Number(row?.ecosystem_wei || 0))),
    l2l3Wei: BigInt(Math.floor(Number(row?.l2l3_wei || 0))),
    distributedWei: BigInt(Math.floor(Number(row?.distributed_wei || 0))),
    queuedCount: Number(row?.queued_count || 0)
  };
}
