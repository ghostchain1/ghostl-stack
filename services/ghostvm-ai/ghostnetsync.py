from __future__ import annotations

import argparse
import json
import sys

from core.apply_engine import apply_plan, rollback_plan
from core.common import read_yaml
from core.discovery import run_discovery
from core.evidence_bundle import (
    bundle_verify_exit_code,
    create_evidence_bundle,
    create_evidence_bundle_include_all,
    verify_evidence_bundle,
)
from core.planner import build_plan, load_latest_plan
from core.remediation import create_nft_remediation_plan
from core.settings import apply_enabled, load_paths
from core.verify_engine import run_verification


def main() -> None:
    parser = argparse.ArgumentParser(prog="ghostnetsync")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("discover")
    sub.add_parser("plan")
    apply_cmd = sub.add_parser("apply")
    apply_cmd.add_argument("--dry-run", action="store_true", default=False)
    verify_cmd = sub.add_parser("verify")
    verify_cmd.add_argument("--context", choices=["host", "l3", "l3-vm", "l3-container"], default="host")
    verify_cmd.add_argument(
        "--probe-source",
        default="",
        help="Container name for docker-exec probe source (auto-selected for l3 context when omitted)",
    )
    remediate_cmd = sub.add_parser("remediate")
    remediate_cmd.add_argument("--apply", action="store_true", default=False)
    bundle_cmd = sub.add_parser("bundle-evidence")
    bundle_cmd.add_argument("--include-all", action="store_true", default=False)
    bundle_cmd.add_argument("--depth", type=int, default=10)
    bundle_cmd.add_argument("--output", default="", help="Custom output directory for bundle artifacts")
    bundle_cmd.add_argument("--sign", action="store_true", default=False, help="Add SHA256 checksums to manifest")
    verify_bundle_cmd = sub.add_parser("verify-bundle")
    verify_bundle_cmd.add_argument("--bundle-dir", required=True, help="Path to bundle directory containing manifest.json")
    verify_bundle_cmd.add_argument("--jsonl", action="store_true", default=False, help="Emit one JSON object per line")
    verify_bundle_cmd.add_argument(
        "--strict",
        action="store_true",
        default=False,
        help="Exit non-zero on verification failure with deterministic exit codes",
    )
    sub.add_parser("rollback")
    sub.add_parser("status")

    args = parser.parse_args()
    paths = load_paths()
    ndsm = read_yaml(paths.config_dir / "network-desired-state.yaml")
    policy = read_yaml(paths.config_dir / "routing-policy.yaml")

    if args.cmd == "discover":
        print(json.dumps(run_discovery(paths.state_dir), indent=2))
        return

    if args.cmd == "plan":
        discovery = run_discovery(paths.state_dir)
        print(json.dumps(build_plan(ndsm, policy, discovery["snapshot"], paths.plans_dir), indent=2))
        return

    if args.cmd == "apply":
        plan_data = load_latest_plan(paths.plans_dir)
        print(
            json.dumps(
                apply_plan(
                    plan=plan_data,
                    plans_dir=paths.plans_dir,
                    approvals_dir=paths.governance_dir,
                    apply_enabled=apply_enabled(),
                    dry_run=bool(args.dry_run or (not apply_enabled())),
                ),
                indent=2,
            )
        )
        return

    if args.cmd == "verify":
        discovery = run_discovery(paths.state_dir)
        print(
            json.dumps(
                run_verification(
                    ndsm,
                    policy,
                    paths.evidence_dir,
                    discovery["snapshot"],
                    context=args.context,
                    probe_source=args.probe_source or None,
                ),
                indent=2,
            )
        )
        return

    if args.cmd == "rollback":
        plan_data = load_latest_plan(paths.plans_dir)
        print(json.dumps(rollback_plan(plan_data, paths.plans_dir, dry_run=True), indent=2))
        return

    if args.cmd == "remediate":
        if args.apply and not apply_enabled():
            print(json.dumps({"ok": False, "reason": "apply_disabled_set_GNS_APPLY_ENABLED_true"}, indent=2))
            return
        print(json.dumps(create_nft_remediation_plan(paths.plans_dir, apply=bool(args.apply)), indent=2))
        return

    if args.cmd == "bundle-evidence":
        if args.include_all:
            out = create_evidence_bundle_include_all(
                root=paths.root,
                plans_dir=paths.plans_dir,
                evidence_dir=paths.evidence_dir,
                depth=max(0, int(args.depth)),
                output=args.output or None,
                sign=bool(args.sign),
            )
        else:
            out = create_evidence_bundle(
                root=paths.root,
                plans_dir=paths.plans_dir,
                evidence_dir=paths.evidence_dir,
                output=args.output or None,
                sign=bool(args.sign),
            )
        print(json.dumps(out, indent=2))
        return

    if args.cmd == "verify-bundle":
        result = verify_evidence_bundle(args.bundle_dir)
        if args.jsonl:
            print(json.dumps({"type": "bundle_summary", **{k: v for k, v in result.items() if k != "checks"}}))
            for check in result.get("checks", []):
                print(json.dumps({"type": "check", **check}))
        else:
            print(json.dumps(result, indent=2))

        if args.strict:
            sys.exit(bundle_verify_exit_code(result))
        return

    if args.cmd == "status":
        print(
            json.dumps(
                {
                    "ok": True,
                    "apply_enabled": apply_enabled(),
                    "paths": {
                        "root": str(paths.root),
                        "config": str(paths.config_dir),
                        "state": str(paths.state_dir),
                        "plans": str(paths.plans_dir),
                        "evidence": str(paths.evidence_dir),
                    },
                    "external_primary_ip": ndsm.get("ipam", {}).get("external_primary_ip"),
                    "external_reserved_ips": ndsm.get("ipam", {}).get("external_reserved_ips", []),
                },
                indent=2,
            )
        )
        return


if __name__ == "__main__":
    main()
