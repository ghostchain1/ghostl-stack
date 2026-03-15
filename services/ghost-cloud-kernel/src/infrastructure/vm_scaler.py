"""VM auto-scaling heuristics via libvirt read-only API.

Security guarantees
-------------------
* Read-only libvirt connection — no VM mutation performed here.
* Scale-out is PROPOSAL-ONLY: a JSON payload is sent to the governance signing
  relay at GACK_SIGNING_RELAY_URL; virt-install is never called autonomously.
* Scale-in proposals follow the same relay pattern.
* DRY_RUN=1 by default — no proposals sent until explicitly enabled.
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request

logger = logging.getLogger(__name__)

_LIBVIRT_URI: str = os.getenv("GACK_LIBVIRT_URI", "qemu:///system")
_VM_NAME_PREFIX: str = os.getenv("GACK_VM_NAME_PREFIX", "ghost")
_MIN_RUNNING_VMS: int = max(1, int(os.getenv("GACK_MIN_RUNNING_VMS", "4")))
_SIGNING_RELAY_URL: str = os.getenv("GACK_SIGNING_RELAY_URL", "http://127.0.0.1:7910")
_DRY_RUN: bool = os.getenv("GACK_VM_DRY_RUN", "1").strip() not in ("0", "false", "False")


def scan_vms() -> dict:
    """Return a snapshot of all ghost-* VMs and their states.

    Uses a read-only libvirt connection — never issues any mutation.
    Gracefully degrades to empty totals when libvirt-python is absent.
    """
    try:
        import libvirt
    except ImportError:
        logger.warning("libvirt-python not installed — VM scan unavailable")
        return {"ok": False, "reason": "libvirt-python not installed", "vms": [], "running": 0, "total": 0}

    conn = None
    try:
        conn = libvirt.openReadOnly(_LIBVIRT_URI)
        if conn is None:
            return {"ok": False, "reason": "libvirt connection refused", "vms": [], "running": 0, "total": 0}

        vms = []
        for dom in conn.listAllDomains():
            name = dom.name()
            if _VM_NAME_PREFIX and not name.startswith(_VM_NAME_PREFIX):
                continue
            state_id, _ = dom.state()
            state = {1: "running", 4: "shutdown", 5: "shut off"}.get(state_id, "other")
            vms.append({"name": name, "state": state, "uuid": dom.UUIDString()})

        running = sum(1 for v in vms if v["state"] == "running")
        return {"ok": True, "vms": vms, "running": running, "total": len(vms)}

    except Exception as exc:
        logger.error("VM scan error: %s", exc)
        return {"ok": False, "reason": str(exc), "vms": [], "running": 0, "total": 0}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def maybe_propose_scale_out(scan_result: dict) -> dict | None:
    """If running VM count is below GACK_MIN_RUNNING_VMS, emit a scale-out proposal.

    Returns the relay response dict, or None if no proposal was needed.
    """
    if not scan_result.get("ok"):
        return None

    running: int = scan_result["running"]
    if running >= _MIN_RUNNING_VMS:
        return None

    reason = (
        f"Only {running}/{_MIN_RUNNING_VMS} required ghost VMs are running. "
        f"Requesting scale-out review."
    )

    if _DRY_RUN:
        logger.info("[DRY_RUN] Would propose VM scale-out: %s", reason)
        return {"dry_run": True, "reason": reason}

    payload = json.dumps({
        "type": "vm_scale_out",
        "reason": reason,
        "current_running": running,
        "min_required": _MIN_RUNNING_VMS,
        "source": "gack",
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{_SIGNING_RELAY_URL}/proposals",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return {"ok": True, "relay_status": resp.status, "reason": reason}
    except urllib.error.URLError as exc:
        logger.warning("Scale-out proposal relay failed: %s", exc)
        return {"ok": False, "reason": str(exc)}
