from __future__ import annotations

from pathlib import Path
from typing import Any

from core.ai_decision_engine import recommend_plan_adjustments
from core.common import ensure_dir, utc_ts, write_json, write_md
from core.docker.docker_manager import plan_docker_networks
from core.hypervisor.libvirt_manager import plan_hypervisor_bridges
from core.policy.policy_guard import detect_subnet_overlaps, validate_external_ip_allocations, validate_routing_law
from core.vm.netplan_manager import plan_vm_network


def build_plan(ndsm: dict[str, Any], policy: dict[str, Any], discovered: dict[str, Any], plans_dir: Path) -> dict[str, Any]:
    ts = utc_ts()
    plan_dir = ensure_dir(plans_dir / ts)

    routing_ok, routing_errors = validate_routing_law(policy)
    overlaps = detect_subnet_overlaps(ndsm)
    external_ips_ok, external_ip_errors = validate_external_ip_allocations(ndsm)
    ai = recommend_plan_adjustments(ndsm, discovered)

    actions: list[dict[str, Any]] = []
    phase = 3
    for action in plan_hypervisor_bridges(ndsm):
        action["id"] = f"p{phase}-hyper-{len(actions)+1}"
        action["phase"] = str(phase)
        actions.append(action)

    phase = 4
    for action in plan_vm_network(ndsm):
        action["id"] = f"p{phase}-vm-{len(actions)+1}"
        action["phase"] = str(phase)
        actions.append(action)

    phase = 5
    for action in plan_docker_networks(ndsm):
        action["id"] = f"p{phase}-docker-{len(actions)+1}"
        action["phase"] = str(phase)
        actions.append(action)

    plan = {
        "id": ts,
        "routing_ok": routing_ok,
        "routing_errors": routing_errors,
        "external_ips_ok": external_ips_ok,
        "external_ip_errors": external_ip_errors,
        "subnet_overlaps": overlaps,
        "ai_recommendations": ai,
        "actions": actions,
    }
    write_json(plan_dir / "plan.json", plan)

    diff_md = [
        f"# GhostNetSync Plan {ts}",
        "",
        f"- Routing law valid: `{routing_ok}`",
        f"- External public IP allocations valid: `{external_ips_ok}`",
        f"- Subnet overlaps: `{len(overlaps)}`",
        "",
        "## Actions",
    ]
    for a in actions:
        diff_md.append(f"- [{a['phase']}] {a['id']} :: {a['description']}")
    write_md(plan_dir / "diff.md", "\n".join(diff_md) + "\n")

    rollback_lines = ["# Rollback", ""]
    for a in actions:
        rollback_lines.append(f"## {a['id']}")
        rollback_lines.append("```bash")
        rollback_lines.append(" ".join(a.get("rollback") or ["echo no-op"]))
        rollback_lines.append("```")
        rollback_lines.append("")
    write_md(plan_dir / "rollback.md", "\n".join(rollback_lines))

    return {"ok": True, "plan": plan, "path": str(plan_dir)}


def load_latest_plan(plans_dir: Path) -> dict[str, Any]:
    if not plans_dir.exists():
        raise FileNotFoundError("plans_dir_missing")
    candidates = sorted([p for p in plans_dir.iterdir() if p.is_dir()])
    if not candidates:
        raise FileNotFoundError("no_plans_found")
    latest = candidates[-1]
    import json

    return json.loads((latest / "plan.json").read_text(encoding="utf-8"))
