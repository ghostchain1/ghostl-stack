#!/usr/bin/env python3
from __future__ import annotations

"""
ghoststorage — AI-driven hypervisor storage manager CLI + daemon.

Sub-commands:
  discover       Probe all VMs and hypervisor; print JSON snapshot
  analyse        Run AI analysis on latest snapshot; print findings
  plan           Generate a storage action plan; print JSON plan
  apply          Execute latest plan (--dry-run default; set GSA_APPLY_ENABLED=true for live)
  status         Print last reconciler state
  daemon         Start FastAPI + background reconciler (production mode)
"""

import argparse
import json
import logging
import sys
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    stream=sys.stderr,
)


def main() -> None:
    parser = argparse.ArgumentParser(prog="ghoststorage", description="Ghost Storage AI CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("discover", help="Probe all VMs and hypervisor storage")
    sub.add_parser("analyse", help="Analyse latest snapshot for findings")
    sub.add_parser("plan", help="Build action plan from findings")
    apply_cmd = sub.add_parser("apply", help="Apply latest plan")
    apply_cmd.add_argument("--dry-run", action="store_true", default=False,
                           help="Simulate only (default: true unless GSA_APPLY_ENABLED=true)")
    sub.add_parser("status", help="Show most recent reconciler state")
    daemon_cmd = sub.add_parser("daemon", help="Run FastAPI API + background reconciler")
    daemon_cmd.add_argument("--host", default="0.0.0.0")
    daemon_cmd.add_argument("--port", type=int, default=None)

    args = parser.parse_args()

    # Lazy imports after arg parse to keep startup fast for --help
    from core.settings import load_paths, apply_enabled, port as default_port

    paths = load_paths()

    if args.cmd == "discover":
        from core.discovery import run_discovery
        result = run_discovery(paths.config_dir, paths.state_dir)
        print(json.dumps(result, indent=2, default=str))

    elif args.cmd == "analyse":
        import json as _json
        from core.discovery import run_discovery
        from core.analyser import analyse_snapshot
        disc = run_discovery(paths.config_dir, paths.state_dir)
        findings = analyse_snapshot(disc["snapshot"])
        print(_json.dumps(findings, indent=2))

    elif args.cmd == "plan":
        from core.discovery import run_discovery
        from core.analyser import analyse_snapshot
        from core.planner import build_plan
        disc = run_discovery(paths.config_dir, paths.state_dir)
        findings = analyse_snapshot(disc["snapshot"])
        plan = build_plan(findings, paths.plans_dir)
        print(json.dumps(plan, indent=2, default=str))

    elif args.cmd == "apply":
        from core.planner import load_latest_plan
        from core.apply_engine import apply_plan
        plan = load_latest_plan(paths.plans_dir)
        if not plan:
            print("No plan found — run `ghoststorage plan` first.", file=sys.stderr)
            sys.exit(1)
        result = apply_plan(
            plan, paths.plans_dir,
            apply_enabled=apply_enabled(),
            dry_run=args.dry_run or not apply_enabled(),
        )
        print(json.dumps(result, indent=2, default=str))
        if result.get("failed", 0) > 0:
            sys.exit(2)

    elif args.cmd == "status":
        import pathlib, json as _json
        state_file = paths.state_dir / "latest-snapshot.json"
        if state_file.exists():
            snap = _json.loads(state_file.read_text())
            print(_json.dumps(snap, indent=2))
        else:
            print("No snapshot yet.", file=sys.stderr)
            sys.exit(1)

    elif args.cmd == "daemon":
        from core.api import app, set_reconciler
        from core.reconciler import StorageReconciler

        r = StorageReconciler()
        r.start()
        set_reconciler(r)

        listen_port = args.port or default_port()
        uvicorn.run(app, host=args.host, port=listen_port, log_level="info")


if __name__ == "__main__":
    main()
