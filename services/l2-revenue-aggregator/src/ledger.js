import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openLedger({ dbPath, migrationPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(migrationPath, "utf8"));
  return db;
}

export function insertRevenueEvent(db, event) {
  const stmt = db.prepare(`
    INSERT INTO revenue_events (
      event_id,
      created_at,
      source_layer,
      source_chain_id,
      target_layer,
      target_chain_id,
      fee_type,
      amount_wei,
      asset,
      authenticity,
      fraud_flag,
      payload_json,
      forwarded_at,
      batch_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `);

  stmt.run(
    event.eventId,
    event.createdAt,
    event.sourceLayer,
    event.sourceChainId,
    event.targetLayer,
    event.targetChainId,
    event.feeType,
    event.amountWei,
    event.asset,
    event.authenticity,
    event.fraudFlag,
    JSON.stringify(event.payload)
  );
}

export function getPendingEvents(db, limit) {
  return db
    .prepare(`
      SELECT event_id,
             created_at,
             source_layer,
             source_chain_id,
             target_layer,
             target_chain_id,
             fee_type,
             amount_wei,
             asset,
             authenticity,
             fraud_flag,
             payload_json
      FROM revenue_events
      WHERE forwarded_at IS NULL
      ORDER BY created_at ASC, event_id ASC
      LIMIT ?
    `)
    .all(limit)
    .map((row) => ({
      eventId: row.event_id,
      createdAt: row.created_at,
      sourceLayer: row.source_layer,
      sourceChainId: Number(row.source_chain_id),
      targetLayer: row.target_layer,
      targetChainId: Number(row.target_chain_id),
      feeType: row.fee_type,
      amountWei: String(row.amount_wei),
      asset: row.asset,
      authenticity: row.authenticity,
      fraudFlag: row.fraud_flag,
      payload: JSON.parse(row.payload_json)
    }));
}

export function markEventsForwarded(db, eventIds, forwardedAt, batchId) {
  const stmt = db.prepare(`
    UPDATE revenue_events
       SET forwarded_at = ?,
           batch_id = ?
     WHERE event_id = ?
  `);

  for (const eventId of eventIds) {
    stmt.run(forwardedAt, batchId, eventId);
  }
}

export function upsertBatch(db, batch) {
  const stmt = db.prepare(`
    INSERT INTO revenue_batches (
      batch_id,
      created_at,
      event_count,
      gross_wei,
      net_wei,
      destination_chain_id,
      forward_status,
      forward_http_status,
      forward_error,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      created_at = excluded.created_at,
      event_count = excluded.event_count,
      gross_wei = excluded.gross_wei,
      net_wei = excluded.net_wei,
      destination_chain_id = excluded.destination_chain_id,
      forward_status = excluded.forward_status,
      forward_http_status = excluded.forward_http_status,
      forward_error = excluded.forward_error,
      payload_json = excluded.payload_json
  `);

  stmt.run(
    batch.batchId,
    batch.createdAt,
    batch.eventCount,
    batch.grossWei,
    batch.netWei,
    batch.destinationChainId,
    batch.forwardStatus,
    batch.forwardHttpStatus,
    batch.forwardError,
    JSON.stringify(batch.payload)
  );
}

export function loadSummary(db, limit = 20) {
  const totals = db
    .prepare(`
      SELECT COUNT(*) AS event_count,
             COALESCE(CAST(SUM(CAST(amount_wei AS REAL)) AS TEXT), '0') AS total_wei,
             COALESCE(CAST(SUM(CASE WHEN fee_type='lp' THEN CAST(amount_wei AS REAL) ELSE 0 END) AS TEXT), '0') AS lp_wei,
             COALESCE(CAST(SUM(CASE WHEN fee_type='bridge' THEN CAST(amount_wei AS REAL) ELSE 0 END) AS TEXT), '0') AS bridge_wei,
             SUM(CASE WHEN forwarded_at IS NULL THEN 1 ELSE 0 END) AS pending_count
      FROM revenue_events
    `)
    .get();

  const batchStats = db
    .prepare(`
      SELECT COUNT(*) AS batch_count,
             SUM(CASE WHEN forward_status!='forwarded' THEN 1 ELSE 0 END) AS batch_failures
      FROM revenue_batches
    `)
    .get();

  const recentBatches = db
    .prepare(`
      SELECT batch_id,
             created_at,
             event_count,
             gross_wei,
             net_wei,
             destination_chain_id,
             forward_status,
             forward_http_status,
             forward_error
      FROM revenue_batches
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit);

  return {
    totalWei: String(totals?.total_wei || "0"),
    liquidityFeeWei: String(totals?.lp_wei || "0"),
    bridgeVolumeWei: String(totals?.bridge_wei || "0"),
    eventCount: Number(totals?.event_count || 0),
    pendingCount: Number(totals?.pending_count || 0),
    batchCount: Number(batchStats?.batch_count || 0),
    batchFailures: Number(batchStats?.batch_failures || 0),
    recentBatches
  };
}
