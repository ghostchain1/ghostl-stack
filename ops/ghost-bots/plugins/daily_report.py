#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import connect, init_schema, utc_now_iso  # noqa: E402


def _load_last_run(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_daily_report(*, db_path: Path, schema_path: Path, last_run_path: Path, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    now = utc_now_iso()
    last_run = _load_last_run(last_run_path)

    with connect(db_path) as conn:
        init_schema(conn, schema_path)

        totals = conn.execute(
            """
            SELECT
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_count,
              SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) AS open_count,
              COUNT(*) AS total_count
            FROM incidents
            """
        ).fetchone()

        open_rows = conn.execute(
            "SELECT id, severity, status, title, subsystem, service, chain_layer, last_seen FROM incidents WHERE status != 'closed' ORDER BY last_seen DESC LIMIT 20"
        ).fetchall()

        recent_verifications = conn.execute(
            "SELECT patch_id, gate_name, ok, ts FROM verifications ORDER BY id DESC LIMIT 30"
        ).fetchall()

    lines: list[str] = []
    lines.append("# Ghost Bots Daily Health")
    lines.append("")
    lines.append(f"- generated_at: `{now}`")
    lines.append(f"- report_scope: `ops/ghost-bots`")
    lines.append("")
    lines.append("## Incident Summary")
    lines.append("")
    lines.append(f"- total: `{int(totals['total_count'] or 0)}`")
    lines.append(f"- open: `{int(totals['open_count'] or 0)}`")
    lines.append(f"- closed: `{int(totals['closed_count'] or 0)}`")
    lines.append("")
    lines.append("## Open Incidents")
    lines.append("")
    if open_rows:
        for r in open_rows:
            layer = str(r["chain_layer"] or "-")
            lines.append(
                f"- `#{r['id']}` [{r['severity']}] {r['title']} "
                f"(subsystem={r['subsystem']}, service={r['service']}, layer={layer}, last_seen={r['last_seen']})"
            )
    else:
        lines.append("- none")
    lines.append("")
    lines.append("## Last Run Checks")
    lines.append("")
    checks = list(last_run.get("checks") or [])
    if checks:
        for c in checks:
            ok = "ok" if bool(c.get("ok")) else "fail"
            layer = str(c.get("chain_layer") or "-")
            lines.append(f"- `{c.get('kind')}` {ok} title={c.get('title')} layer={layer} summary={c.get('summary')}")
    else:
        lines.append("- no run data found")
    lines.append("")
    lines.append("## Recent Verifications")
    lines.append("")
    if recent_verifications:
        for v in recent_verifications:
            ok = "ok" if int(v["ok"]) == 1 else "fail"
            lines.append(f"- patch={v['patch_id']} gate={v['gate_name']} {ok} ts={v['ts']}")
    else:
        lines.append("- none")
    lines.append("")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate daily health markdown report for ghost-bots.")
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--schema", default=str(CODE_ROOT / "db/schema.sql"))
    ap.add_argument("--last-run", default=str(CODE_ROOT / "reports/last_run.json"))
    ap.add_argument("--out", default=str(CODE_ROOT / "reports/daily_health.md"))
    args = ap.parse_args()

    path = write_daily_report(
        db_path=Path(args.db).resolve(),
        schema_path=Path(args.schema).resolve(),
        last_run_path=Path(args.last_run).resolve(),
        out_path=Path(args.out).resolve(),
    )
    print(str(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
