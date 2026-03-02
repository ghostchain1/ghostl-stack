from __future__ import annotations

"""
Planner — turns analyser findings into ordered, safe StorageActions.

Safety tiers:
  tier-1  safe        journal vacuum, apt clean, tmp clean   (auto-apply when GSA_APPLY_ENABLED)
  tier-2  moderate    log rotation, old core dumps           (auto-apply when GSA_APPLY_ENABLED)
  tier-3  destructive qcow2 resize, manual review needed     (requires governance approval)
"""

import json
import logging
from pathlib import Path
from typing import Any

from core.common import ensure_dir, utc_ts, write_json
from core.settings import journal_warn_mb

log = logging.getLogger("ghost-storage-ai.planner")

# ── Action generators ─────────────────────────────────────────────────────────


def _journal_vacuum_action(vm: str, finding_id: str, idx: int) -> dict[str, Any]:
    return {
        "id": f"t1-journal-{idx}",
        "vm": vm,
        "phase": "tier-1",
        "description": f"[{vm}] Vacuum systemd journal to 100 MB",
        "command": ["bash", "-c", "sudo journalctl --vacuum-size=100M"],
        "destructive": False,
        "rollback": [],
        "findings": [finding_id],
    }


def _apt_clean_action(vm: str, finding_id: str, idx: int) -> dict[str, Any]:
    return {
        "id": f"t1-apt-{idx}",
        "vm": vm,
        "phase": "tier-1",
        "description": f"[{vm}] Clean APT package cache",
        "command": ["bash", "-c", "sudo apt-get clean && sudo apt-get autoremove -y --purge"],
        "destructive": False,
        "rollback": [],
        "findings": [finding_id],
    }


def _tmp_clean_action(vm: str, finding_id: str, idx: int) -> dict[str, Any]:
    return {
        "id": f"t1-tmp-{idx}",
        "vm": vm,
        "phase": "tier-1",
        "description": f"[{vm}] Clean /tmp files older than 24h",
        "command": ["bash", "-c", r"sudo find /tmp -mindepth 1 -mtime +1 -delete 2>/dev/null || true"],
        "destructive": False,
        "rollback": [],
        "findings": [finding_id],
    }


def _log_rotate_action(vm: str, finding_id: str, idx: int) -> dict[str, Any]:
    return {
        "id": f"t2-logrotate-{idx}",
        "vm": vm,
        "phase": "tier-2",
        "description": f"[{vm}] Force logrotate + truncate stale logs > 7 days",
        "command": ["bash", "-c", (
            "sudo logrotate -f /etc/logrotate.conf 2>/dev/null || true; "
            r"sudo find /var/log -name '*.log.*' -mtime +7 -delete 2>/dev/null || true"
        )],
        "destructive": False,
        "rollback": [],
        "findings": [finding_id],
    }


def _core_dump_clean_action(vm: str, finding_id: str, idx: int) -> dict[str, Any]:
    return {
        "id": f"t2-coredump-{idx}",
        "vm": vm,
        "phase": "tier-2",
        "description": f"[{vm}] Remove systemd core dumps",
        "command": ["bash", "-c", "sudo rm -rf /var/lib/systemd/coredump/* 2>/dev/null || true"],
        "destructive": False,
        "rollback": [],
        "findings": [finding_id],
    }


def _qcow_sparsify_action(vm: str, path: str, finding_id: str, idx: int) -> dict[str, Any]:
    backup = path + ".bak"
    return {
        "id": f"t3-sparsify-{idx}",
        "vm": "hypervisor",
        "phase": "tier-3",
        "description": f"[{vm}] Sparsify qcow2 image: {path}",
        # virt-sparsify requires VM to be shut down first
        "command": ["bash", "-c", (
            f"virsh shutdown {vm} || true; sleep 10; "
            f"sudo virt-sparsify --in-place {path}; "
            f"virsh start {vm} || true"
        )],
        "destructive": True,
        "rollback": [f"cp {backup} {path}"],
        "findings": [finding_id],
    }


# ── Main planner ──────────────────────────────────────────────────────────────

def build_plan(findings: list[dict[str, Any]], plans_dir: Path) -> dict[str, Any]:
    ts = utc_ts()
    plan_dir = ensure_dir(plans_dir / ts)

    actions: list[dict[str, Any]] = []
    t1_idx = t2_idx = t3_idx = 1

    # Track which VMs already have a given action type (dedupe)
    seen: set[str] = set()

    for f in findings:
        vm: str = f["vm"]
        category: str = f["category"]
        fid: str = f["id"]
        sev: str = f["severity"]

        key_journal = f"{vm}:journal"
        key_apt = f"{vm}:apt_cache"
        key_tmp = f"{vm}:tmp"
        key_log = f"{vm}:logrotate"
        key_core = f"{vm}:coredump"

        if category == "journal" and key_journal not in seen:
            actions.append(_journal_vacuum_action(vm, fid, t1_idx))
            seen.add(key_journal)
            t1_idx += 1

        if category == "apt_cache" and key_apt not in seen:
            actions.append(_apt_clean_action(vm, fid, t1_idx))
            seen.add(key_apt)
            t1_idx += 1

        if category == "tmp" and key_tmp not in seen:
            actions.append(_tmp_clean_action(vm, fid, t1_idx))
            seen.add(key_tmp)
            t1_idx += 1

        if category == "disk_full" and sev in ("crit", "warn"):
            # Escalate — add tier-2 log rotation if disk is > warn threshold
            if key_log not in seen:
                actions.append(_log_rotate_action(vm, fid, t2_idx))
                seen.add(key_log)
                t2_idx += 1
            if key_core not in seen:
                actions.append(_core_dump_clean_action(vm, fid, t2_idx))
                seen.add(key_core)
                t2_idx += 1

        if category == "qcow_sparse":
            # Extract path from detail string
            detail: str = f.get("detail", "")
            path = ""
            for token in detail.split():
                if "/" in token:
                    path = token
                    break
            if path:
                key_sparse = f"{vm}:sparsify:{path}"
                if key_sparse not in seen:
                    actions.append(_qcow_sparsify_action(vm, path, fid, t3_idx))
                    seen.add(key_sparse)
                    t3_idx += 1

    # Sort: tier-1 first, then tier-2, tier-3
    tier_order = {"tier-1": 0, "tier-2": 1, "tier-3": 2}
    actions.sort(key=lambda a: tier_order.get(a["phase"], 9))

    crit = sum(1 for f in findings if f["severity"] == "crit")
    warn = sum(1 for f in findings if f["severity"] == "warn")

    plan: dict[str, Any] = {
        "id": ts,
        "findings_crit": crit,
        "findings_warn": warn,
        "action_count": len(actions),
        "actions": actions,
    }
    write_json(plan_dir / "plan.json", plan)
    log.info("Plan %s: %d actions (%d crit findings, %d warn findings)", ts, len(actions), crit, warn)
    return plan


def load_latest_plan(plans_dir: Path) -> dict[str, Any]:
    if not plans_dir.exists():
        return {}
    dirs = sorted(d for d in plans_dir.iterdir() if d.is_dir())
    if not dirs:
        return {}
    plan_file = dirs[-1] / "plan.json"
    if not plan_file.exists():
        return {}
    return json.loads(plan_file.read_text())
