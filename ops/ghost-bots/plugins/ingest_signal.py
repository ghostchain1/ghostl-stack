#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import IncidentUpsert, connect, init_schema, insert_signal, upsert_incident  # noqa: E402
from core.fingerprint import stable_fingerprint  # noqa: E402


def _severity_for(kind: str) -> str:
    if kind in ("docker_ps_failed",):
        return "critical"
    if kind in ("gst_leakage_gate", "gst_symbol_gate", "rpc_down"):
        return "high"
    if kind in ("docker_health",):
        return "medium"
    return "low"


def main() -> int:
    ap = argparse.ArgumentParser(description="Insert a signal and upsert a de-duplicated incident.")
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--schema", default=str(CODE_ROOT / "db/schema.sql"))
    ap.add_argument("--kind", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--summary", default="")
    ap.add_argument("--subsystem", default="")
    ap.add_argument("--layer", default="")
    ap.add_argument("--service", default="")
    ap.add_argument("--source", default="manual")
    ap.add_argument("--severity", default="")
    ap.add_argument("--status", default="open")
    ap.add_argument("--payload-json", default="{}")
    args = ap.parse_args()

    try:
        payload = json.loads(args.payload_json)
    except Exception as e:  # pragma: no cover
        raise SystemExit(f"invalid --payload-json: {e}") from e

    fp = stable_fingerprint(
        {
            "kind": args.kind,
            "title": args.title,
            "subsystem": args.subsystem,
            "chain_layer": args.layer,
            "service": args.service,
        }
    )

    inc = IncidentUpsert(
        severity=args.severity or _severity_for(args.kind),
        status=args.status,
        title=args.title,
        summary=args.summary,
        root_cause="",
        subsystem=args.subsystem,
        chain_layer=args.layer,
        service=args.service,
        fingerprint=fp,
    )

    with connect(Path(args.db)) as conn:
        init_schema(conn, Path(args.schema))
        incident_id = upsert_incident(conn, inc)
        insert_signal(conn, incident_id=incident_id, source=args.source, kind=args.kind, payload=payload)

    print(json.dumps({"incident_id": incident_id, "fingerprint": fp}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
