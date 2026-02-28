import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDb({ dbPath, migrationPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(migrationPath, "utf8"));
  return db;
}

export function insertProposal(db, proposal) {
  db.prepare(
    `INSERT INTO proposals (
       proposal_id, created_at, treasury_snapshot_json, input_json, summary_json
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(proposal_id) DO UPDATE SET
       treasury_snapshot_json = excluded.treasury_snapshot_json,
       input_json = excluded.input_json,
       summary_json = excluded.summary_json`
  ).run(
    proposal.proposalId,
    proposal.createdAt,
    JSON.stringify(proposal.treasurySnapshot),
    JSON.stringify(proposal.input),
    JSON.stringify(proposal.summary)
  );
}

export function replaceRankedStrategies(db, proposalId, strategies, createdAt) {
  db.prepare(`DELETE FROM ranked_strategies WHERE proposal_id = ?`).run(proposalId);
  const stmt = db.prepare(
    `INSERT INTO ranked_strategies (
       strategy_id,
       proposal_id,
       rank_index,
       score,
       expected_apy_min_bps,
       expected_apy_max_bps,
       worst_drawdown_bps,
       risk_score_bps,
       concentration_bps,
       reason_codes_json,
       policy_violations_json,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const strategy of strategies) {
    stmt.run(
      strategy.strategyId,
      proposalId,
      strategy.rank,
      strategy.score,
      strategy.expectedApyRangeBps.min,
      strategy.expectedApyRangeBps.max,
      strategy.worstCaseDrawdownBps,
      strategy.riskScoreBps,
      strategy.protocolConcentrationBps,
      JSON.stringify(strategy.reasonCodes),
      JSON.stringify(strategy.policyViolations),
      createdAt
    );
  }
}

export function upsertEvidencePack(db, row) {
  db.prepare(
    `INSERT INTO evidence_packs (
       proposal_id, bundle_path, created_at, files_json
     ) VALUES (?, ?, ?, ?)
     ON CONFLICT(proposal_id) DO UPDATE SET
       bundle_path = excluded.bundle_path,
       created_at = excluded.created_at,
       files_json = excluded.files_json`
  ).run(row.proposalId, row.bundlePath, row.createdAt, JSON.stringify(row.files));
}

export function listProposals(db, limit = 100) {
  const rows = db
    .prepare(
      `SELECT proposal_id, created_at, summary_json
         FROM proposals
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(limit);
  return rows.map((row) => ({
    proposalId: row.proposal_id,
    createdAt: row.created_at,
    summary: JSON.parse(row.summary_json)
  }));
}

export function getProposal(db, proposalId) {
  const row = db
    .prepare(
      `SELECT proposal_id, created_at, treasury_snapshot_json, input_json, summary_json
         FROM proposals
        WHERE proposal_id = ?`
    )
    .get(proposalId);
  if (!row) return null;
  return {
    proposalId: row.proposal_id,
    createdAt: row.created_at,
    treasurySnapshot: JSON.parse(row.treasury_snapshot_json),
    input: JSON.parse(row.input_json),
    summary: JSON.parse(row.summary_json)
  };
}

export function getRankedStrategies(db, proposalId) {
  const rows = db
    .prepare(
      `SELECT strategy_id,
              rank_index,
              score,
              expected_apy_min_bps,
              expected_apy_max_bps,
              worst_drawdown_bps,
              risk_score_bps,
              concentration_bps,
              reason_codes_json,
              policy_violations_json
         FROM ranked_strategies
        WHERE proposal_id = ?
        ORDER BY rank_index ASC`
    )
    .all(proposalId);
  return rows.map((row) => ({
    strategyId: row.strategy_id,
    rank: Number(row.rank_index),
    score: Number(row.score),
    expectedApyRangeBps: {
      min: Number(row.expected_apy_min_bps),
      max: Number(row.expected_apy_max_bps)
    },
    worstCaseDrawdownBps: Number(row.worst_drawdown_bps),
    riskScoreBps: Number(row.risk_score_bps),
    protocolConcentrationBps: Number(row.concentration_bps),
    reasonCodes: JSON.parse(row.reason_codes_json),
    policyViolations: JSON.parse(row.policy_violations_json)
  }));
}

export function getEvidencePack(db, proposalId) {
  const row = db
    .prepare(
      `SELECT proposal_id, bundle_path, created_at, files_json
         FROM evidence_packs
        WHERE proposal_id = ?`
    )
    .get(proposalId);
  if (!row) return null;
  return {
    proposalId: row.proposal_id,
    bundlePath: row.bundle_path,
    createdAt: row.created_at,
    files: JSON.parse(row.files_json)
  };
}
