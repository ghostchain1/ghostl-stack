from __future__ import annotations

"""
Apply engine — executes StorageActions from a plan.

Tier-1 and Tier-2 actions run via SSH.
Tier-3 (destructive) actions are blocked unless explicitly approved via
a governance approval file in `plans_dir/<plan_id>/approvals/<action_id>.approved`.
"""

import logging
from pathlib import Path
from typing import Any

from core.common import run_local, run_ssh
from core.settings import ssh_key_path, ssh_timeout, ssh_user

log = logging.getLogger("ghost-storage-ai.apply_engine")


def _is_approved(action_id: str, plan_id: str, plans_dir: Path) -> bool:
    approval = plans_dir / plan_id / "approvals" / f"{action_id}.approved"
    return approval.exists()


def _run_action(action: dict[str, Any], *, dry_run: bool) -> dict[str, Any]:
    vm: str = action["vm"]
    cmd: list[str] = action["command"]
    phase: str = action["phase"]
    destructive: bool = action.get("destructive", False)

    result: dict[str, Any] = {
        "id": action["id"],
        "vm": vm,
        "phase": phase,
        "description": action["description"],
        "destructive": destructive,
        "dry_run": dry_run,
        "rc": None,
        "stdout": "",
        "stderr": "",
    }

    if dry_run:
        result["rc"] = 0
        result["stdout"] = f"[DRY-RUN] would run: {' '.join(cmd)}"
        return result

    # Execute
    if vm == "hypervisor":
        # Run locally on the hypervisor
        full_cmd = cmd
        rc, stdout, stderr = run_local(full_cmd, timeout=ssh_timeout() * 4)
    else:
        # SSH to target VM
        shell_cmd = " ".join(cmd) if cmd[0] == "bash" else " ".join(cmd)
        rc, stdout, stderr = run_ssh(
            vm,  # will be resolved via /etc/hosts or config
            shell_cmd,
            user=ssh_user(),
            key=ssh_key_path(),
            timeout=ssh_timeout() * 2,
        )

    result["rc"] = rc
    result["stdout"] = stdout[:2000]
    result["stderr"] = stderr[:500]

    if rc == 0:
        log.info("Action %s OK on %s", action["id"], vm)
    else:
        log.warning("Action %s FAILED on %s (rc=%d): %s", action["id"], vm, rc, stderr)

    return result


def apply_plan(
    plan: dict[str, Any],
    plans_dir: Path,
    *,
    apply_enabled: bool,
    dry_run: bool = False,
) -> dict[str, Any]:
    plan_id: str = plan.get("id", "unknown")
    actions: list[dict[str, Any]] = plan.get("actions", [])
    results: list[dict[str, Any]] = []

    effective_dry_run = dry_run or not apply_enabled

    for action in actions:
        is_destructive: bool = action.get("destructive", False)

        # Tier-3 destructive actions need a governance approval file
        if is_destructive and not effective_dry_run:
            if not _is_approved(action["id"], plan_id, plans_dir):
                log.warning(
                    "Skipping destructive action %s — no approval file at plans/%s/approvals/%s.approved",
                    action["id"], plan_id, action["id"],
                )
                results.append({
                    **action,
                    "rc": -1,
                    "stdout": "",
                    "stderr": "Blocked: awaiting governance approval",
                    "dry_run": False,
                })
                continue

        res = _run_action(action, dry_run=effective_dry_run)
        results.append(res)

    ok = sum(1 for r in results if r["rc"] == 0)
    fail = sum(1 for r in results if (r["rc"] or 0) > 0)
    skip = sum(1 for r in results if (r["rc"] or 0) == -1)

    return {
        "plan_id": plan_id,
        "dry_run": effective_dry_run,
        "total": len(results),
        "ok": ok,
        "failed": fail,
        "skipped": skip,
        "results": results,
    }
