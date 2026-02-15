#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import (  # noqa: E402
    IncidentUpsert,
    close_incident_if_open,
    connect,
    init_schema,
    insert_patch_candidate,
    insert_signal,
    upsert_incident,
    utc_now_iso,
)
from core.fingerprint import stable_fingerprint  # noqa: E402
from core.ranker import PatchCandidate, score  # noqa: E402
from plugins.gst_gate import check_gst_leakage, check_gst_symbol  # noqa: E402
from plugins.patchsmith import candidates_for_incident  # noqa: E402
from plugins.sentinel import check_docker_health, check_rpc  # noqa: E402


def resolve_repo_root() -> Path:
    env = os.environ.get("GHOST_REPO_ROOT") or os.environ.get("GHOST_BOTS_REPO_ROOT")
    if env:
        return Path(env).resolve()

    cwd = Path.cwd().resolve()
    if (cwd / ".git").exists():
        return cwd

    # Fallback for in-repo runs when executed from another CWD.
    for p in Path(__file__).resolve().parents:
        if (p / ".git").exists():
            return p

    return cwd


def _severity_for(kind: str) -> str:
    if kind in ("docker_ps_failed",):
        return "critical"
    if kind in ("gst_leakage_gate", "gst_symbol_gate"):
        return "high"
    if kind in ("rpc_down",):
        return "high"
    if kind in ("docker_health",):
        return "medium"
    return "low"


def _incident_fingerprint(kind: str, title: str, subsystem: str, chain_layer: str, service: str) -> str:
    return stable_fingerprint(
        {
            "kind": kind,
            "title": title,
            "subsystem": subsystem,
            "chain_layer": chain_layer,
            "service": service,
        }
    )


def _maybe_seed_patch_candidates(conn, incident_id: int, incident_kind: str) -> None:
    # Seed patch candidates once per incident.
    existing = conn.execute("SELECT patch_type FROM patches WHERE incident_id = ?", (incident_id,)).fetchall()
    existing_types = {str(r[0]) for r in existing}

    for spec in candidates_for_incident(incident_kind):
        if spec.patch_type in existing_types:
            continue

        rank = score(
            PatchCandidate(
                patch_type=spec.patch_type,
                files_touched=spec.files_touched,
                lines_changed=spec.lines_changed,
                rollback_simple=spec.rollback_simple,
                verification_coverage=spec.verification_coverage,
                touches_stateful_chain=spec.touches_stateful_chain,
                changes_volumes=spec.changes_volumes,
                changes_rpc_endpoints_without_shim=spec.changes_rpc_endpoints_without_shim,
                violates_policy=spec.violates_policy,
            )
        )

        insert_patch_candidate(
            conn,
            incident_id=incident_id,
            rank_score=rank,
            patch_type=spec.patch_type,
            files=spec.files,
            diff_stat={"linesChanged": spec.lines_changed, "filesTouched": spec.files_touched},
            rationale=spec.rationale,
            risk=spec.risk,
            rollback=spec.rollback,
            status="proposed",
        )


def run_once(*, repo_root: Path, db_path: Path, schema_path: Path) -> dict[str, Any]:
    checks = []

    # Runtime health.
    checks.append(check_docker_health(str(repo_root)))

    # Chain RPC health.
    checks.append(check_rpc("http://localhost:18545", layer="L1", expected_chain_id=14000101))
    checks.append(check_rpc("http://localhost:29547", layer="L2", expected_chain_id=901))
    checks.append(check_rpc("http://localhost:39545", layer="L3", expected_chain_id=903))

    # Repo policy gates.
    checks.append(check_gst_leakage(str(repo_root)))
    checks.append(check_gst_symbol(str(repo_root)))

    now = utc_now_iso()
    failures = [c for c in checks if not c.ok]

    with connect(db_path) as conn:
        init_schema(conn, schema_path)

        for c in failures:
            fp = _incident_fingerprint(c.kind, c.title, c.subsystem, c.chain_layer, c.service)
            inc = IncidentUpsert(
                severity=_severity_for(c.kind),
                status="open",
                title=c.title,
                summary=c.summary,
                root_cause="",
                subsystem=c.subsystem,
                chain_layer=c.chain_layer,
                service=c.service,
                fingerprint=fp,
            )
            incident_id = upsert_incident(conn, inc)
            insert_signal(conn, incident_id=incident_id, source="orchestrator", kind=c.kind, payload=c.payload, ts=now)
            _maybe_seed_patch_candidates(conn, incident_id, c.kind)

        # Close incidents whose checks now pass. Some checks have distinct pass/fail kinds,
        # so we handle those explicitly here.
        for c in checks:
            if not c.ok:
                continue

            fp = _incident_fingerprint(c.kind, c.title, c.subsystem, c.chain_layer, c.service)
            close_incident_if_open(conn, fp)

            if c.kind == "rpc_health" and c.chain_layer:
                down_fp = _incident_fingerprint("rpc_down", f"{c.chain_layer} RPC down", "rpc", c.chain_layer, "rpc")
                close_incident_if_open(conn, down_fp)

            if c.kind == "docker_health":
                ps_fp = _incident_fingerprint("docker_ps_failed", "Docker daemon not reachable", "runtime", "", "docker")
                close_incident_if_open(conn, ps_fp)

        export = {"ts": now, "failures": len(failures)}
        export_path = CODE_ROOT / "reports/incident_export.json"
        export_path.write_text(json.dumps(export, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    return {
        "ts": now,
        "checks": [c.__dict__ for c in checks],
        "failures": [c.__dict__ for c in failures],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Ghost Bots orchestrator (incident DB + GST enforcement)")
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--interval", type=int, default=300)
    args = ap.parse_args()

    db_path = Path(args.db)
    schema_path = CODE_ROOT / "db/schema.sql"
    repo_root = resolve_repo_root()

    if not args.once and not args.loop:
        args.once = True

    if args.once:
        report = run_once(repo_root=repo_root, db_path=db_path, schema_path=schema_path)
        out_path = CODE_ROOT / "reports/last_run.json"
        out_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {out_path}")
        return 0 if len(report["failures"]) == 0 else 1

    while True:
        try:
            run_once(repo_root=repo_root, db_path=db_path, schema_path=schema_path)
        except Exception as e:
            # Orchestrator should not crash-loop without emitting something.
            err_path = CODE_ROOT / "reports/last_error.txt"
            err_path.write_text(str(e) + "\n", encoding="utf-8")
        time.sleep(max(10, int(args.interval)))


if __name__ == "__main__":
    raise SystemExit(main())
