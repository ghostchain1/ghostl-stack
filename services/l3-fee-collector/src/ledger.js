import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openLedger({ dbPath, migrationPath }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(migrationPath, "utf8"));
  return db;
}

export function insertFeeEvent(db, event) {
  const stmt = db.prepare(`
    INSERT INTO fee_events (
      event_id,
      created_at,
      source_type,
      amount_wei,
      asset,
      destination_layer,
      destination_chain_id,
      destination_bridge_address,
      forward_status,
      forward_http_status,
      forward_error,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    event.eventId,
    event.createdAt,
    event.sourceType,
    event.amountWei,
    event.asset,
    event.destinationLayer,
    event.destinationChainId,
    event.destinationBridgeAddress,
    event.forwardStatus,
    event.forwardHttpStatus,
    event.forwardError,
    JSON.stringify(event.payload)
  );
}

export function loadSummary(db, limit = 20) {
  const totalsRow = db
    .prepare(`
      SELECT COALESCE(CAST(SUM(CAST(amount_wei AS REAL)) AS TEXT), '0') AS total_wei,
             COUNT(*) AS count,
             SUM(CASE WHEN forward_status != 'forwarded' THEN 1 ELSE 0 END) AS failures
      FROM fee_events
    `)
    .get();

  const sourceRows = db
    .prepare(`
      SELECT source_type,
             COUNT(*) AS event_count,
             COALESCE(CAST(SUM(CAST(amount_wei AS REAL)) AS TEXT), '0') AS total_wei
      FROM fee_events
      GROUP BY source_type
      ORDER BY source_type ASC
    `)
    .all();

  const recent = db
    .prepare(`
      SELECT event_id,
             created_at,
             source_type,
             amount_wei,
             destination_layer,
             destination_chain_id,
             destination_bridge_address,
             forward_status,
             forward_http_status,
             forward_error
      FROM fee_events
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit);

  return {
    totalWei: String(totalsRow?.total_wei || "0"),
    eventCount: Number(totalsRow?.count || 0),
    forwardFailures: Number(totalsRow?.failures || 0),
    bySource: sourceRows.map((row) => ({
      source: row.source_type,
      eventCount: Number(row.event_count || 0),
      totalWei: String(row.total_wei || "0")
    })),
    recent
  };
}
