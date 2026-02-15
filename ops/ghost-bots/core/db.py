from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


def utc_now_iso() -> str:
    import datetime

    return datetime.datetime.now(tz=datetime.timezone.utc).replace(microsecond=0).isoformat()


@dataclass(frozen=True)
class IncidentUpsert:
    severity: str
    status: str
    title: str
    summary: str
    root_cause: str
    subsystem: str
    chain_layer: str
    service: str
    fingerprint: str


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection, schema_sql_path: Path) -> None:
    sql = schema_sql_path.read_text(encoding="utf-8")
    conn.executescript(sql)
    conn.commit()


def upsert_incident(conn: sqlite3.Connection, inc: IncidentUpsert) -> int:
    now = utc_now_iso()

    row = conn.execute("SELECT id, first_seen FROM incidents WHERE fingerprint = ?", (inc.fingerprint,)).fetchone()
    if row:
        conn.execute(
            """
            UPDATE incidents
            SET severity = ?, status = ?, title = ?, summary = ?, root_cause = ?, subsystem = ?, chain_layer = ?, service = ?, last_seen = ?
            WHERE id = ?
            """,
            (
                inc.severity,
                inc.status,
                inc.title,
                inc.summary,
                inc.root_cause,
                inc.subsystem,
                inc.chain_layer,
                inc.service,
                now,
                row["id"],
            ),
        )
        conn.commit()
        return int(row["id"])

    cur = conn.execute(
        """
        INSERT INTO incidents (
          created_at, severity, status, title, summary, root_cause, subsystem, chain_layer, service,
          fingerprint, first_seen, last_seen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now,
            inc.severity,
            inc.status,
            inc.title,
            inc.summary,
            inc.root_cause,
            inc.subsystem,
            inc.chain_layer,
            inc.service,
            inc.fingerprint,
            now,
            now,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def close_incident_if_open(conn: sqlite3.Connection, fingerprint: str) -> bool:
    """
    Mark an existing incident as closed. No-op if it doesn't exist or is already closed.
    """
    now = utc_now_iso()
    cur = conn.execute(
        "UPDATE incidents SET status = 'closed', last_seen = ? WHERE fingerprint = ? AND status != 'closed'",
        (now, fingerprint),
    )
    conn.commit()
    return cur.rowcount > 0


def insert_signal(
    conn: sqlite3.Connection,
    *,
    incident_id: int,
    source: str,
    kind: str,
    payload: dict[str, Any],
    ts: Optional[str] = None,
) -> int:
    ts_val = ts or utc_now_iso()
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    cur = conn.execute(
        "INSERT INTO signals (incident_id, ts, source, kind, payload_json) VALUES (?, ?, ?, ?, ?)",
        (incident_id, ts_val, source, kind, payload_json),
    )
    conn.commit()
    return int(cur.lastrowid)


def insert_patch_candidate(
    conn: sqlite3.Connection,
    *,
    incident_id: int,
    rank_score: int,
    patch_type: str,
    files: list[str],
    diff_stat: dict[str, Any],
    rationale: str,
    risk: str,
    rollback: str,
    status: str,
) -> int:
    now = utc_now_iso()
    cur = conn.execute(
        """
        INSERT INTO patches (
          incident_id, created_at, rank_score, patch_type, files_json, diff_stat_json, rationale, risk, rollback, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            incident_id,
            now,
            rank_score,
            patch_type,
            json.dumps(files, ensure_ascii=True),
            json.dumps(diff_stat, ensure_ascii=True),
            rationale,
            risk,
            rollback,
            status,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def get_open_incidents(conn: sqlite3.Connection, limit: int = 200) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM incidents WHERE status != 'closed' ORDER BY last_seen DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_incident_detail(conn: sqlite3.Connection, incident_id: int) -> dict[str, Any]:
    inc = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not inc:
        raise KeyError(f"incident not found: {incident_id}")

    signals = conn.execute(
        "SELECT * FROM signals WHERE incident_id = ? ORDER BY ts DESC LIMIT 500",
        (incident_id,),
    ).fetchall()

    patches = conn.execute(
        "SELECT * FROM patches WHERE incident_id = ? ORDER BY rank_score DESC, created_at DESC LIMIT 100",
        (incident_id,),
    ).fetchall()

    out: dict[str, Any] = dict(inc)
    out["signals"] = [dict(s) for s in signals]
    out["patches"] = [dict(p) for p in patches]
    return out
