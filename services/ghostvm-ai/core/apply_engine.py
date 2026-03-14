from __future__ import annotations

from pathlib import Path
from typing import Any

from core.common import run_command, write_json
from core.governance import check_approval, plan_hash


def apply_plan(
    plan: dict[str, Any],
    plans_dir: Path,
    approvals_dir: Path,
    apply_enabled: bool,
    dry_run: bool = True,
) -> dict[str, Any]:
    pid = plan["id"]
    out_file = plans_dir / pid / "apply-result.json"
    results: list[dict[str, Any]] = []

    if not plan.get("routing_ok", False):
        result = {"ok": False, "reason": "routing_law_invalid", "errors": plan.get("routing_errors")}
        write_json(out_file, result)
        return result

    p_hash = plan_hash(plan)
    for action in plan.get("actions") or []:
        destructive = bool(action.get("destructive"))
        if destructive:
            ok, reason = check_approval(approvals_dir, action["id"], p_hash)
            if not ok:
                results.append({"id": action["id"], "ok": False, "reason": reason})
                write_json(out_file, {"ok": False, "results": results, "reason": "governance_required"})
                return {"ok": False, "results": results, "reason": "governance_required"}

        if not apply_enabled or dry_run:
            results.append({"id": action["id"], "ok": True, "dry_run": True, "cmd": action.get("command")})
            continue

        exec_result = run_command(action.get("command") or ["echo", "noop"])
        results.append({"id": action["id"], **exec_result})
        if not exec_result.get("ok"):
            write_json(out_file, {"ok": False, "results": results, "failed_action": action["id"]})
            return {"ok": False, "results": results, "failed_action": action["id"]}

    payload = {"ok": True, "results": results}
    write_json(out_file, payload)
    return payload


def rollback_plan(plan: dict[str, Any], plans_dir: Path, dry_run: bool = True) -> dict[str, Any]:
    pid = plan["id"]
    out_file = plans_dir / pid / "rollback-result.json"
    results: list[dict[str, Any]] = []

    for action in reversed(plan.get("actions") or []):
        cmd = action.get("rollback") or ["echo", "no-op"]
        if dry_run:
            results.append({"id": action["id"], "ok": True, "dry_run": True, "cmd": cmd})
            continue
        exec_result = run_command(cmd)
        results.append({"id": action["id"], **exec_result})

    payload = {"ok": True, "results": results}
    write_json(out_file, payload)
    return payload
