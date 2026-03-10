"""VM lifecycle management via libvirt Python API.

Security guarantees
-------------------
* Uses libvirt domain API exclusively — no subprocess, no shell, no virsh CLI.
* VM names are validated against a strict allowlist before any mutation.
* A per-VM cooldown and hourly circuit breaker prevent runaway restart loops.
* DRY_RUN=1 by default: all actions are logged only, nothing is executed.
* VM *provisioning* is PROPOSAL-ONLY — it sends a JSON payload to the signing
  relay at GNMC_SIGNING_RELAY_URL and never calls virt-install autonomously.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_LIBVIRT_URI: str = os.getenv("GNMC_LIBVIRT_URI", "qemu:///system")

_ALLOWLIST_RAW: str = os.getenv("GNMC_VM_ALLOWLIST", "")
# Empty string → empty frozenset → NO VM can be started (fail-closed).
_VM_ALLOWLIST: frozenset[str] = frozenset(
    n.strip() for n in _ALLOWLIST_RAW.split(",") if n.strip()
)

_COOLDOWN_S: int = max(30, int(os.getenv("GNMC_VM_COOLDOWN_S", "120")))
_MAX_PER_HOUR: int = max(1, int(os.getenv("GNMC_VM_MAX_PER_HOUR", "4")))
_DRY_RUN: bool = os.getenv("GNMC_VM_DRY_RUN", "1").strip() not in ("0", "false", "False")
_SIGNING_RELAY_URL: str = os.getenv("GNMC_SIGNING_RELAY_URL", "http://127.0.0.1:7910")

# ── Rate / cooldown tracking ──────────────────────────────────────────────────
@dataclass
class _OpRecord:
    timestamps: list[float] = field(default_factory=list)
    last_op: float = 0.0

_op_records: dict[str, _OpRecord] = defaultdict(_OpRecord)


def _check_rate(name: str) -> tuple[bool, str]:
    """Return (allowed, reason). Prunes stale timestamps from the sliding window."""
    now = time.monotonic()
    rec = _op_records[name]
    rec.timestamps = [t for t in rec.timestamps if now - t < 3600]
    if len(rec.timestamps) >= _MAX_PER_HOUR:
        return False, f"circuit breaker: {_MAX_PER_HOUR} ops/hour exceeded"
    if now - rec.last_op < _COOLDOWN_S:
        remaining = int(_COOLDOWN_S - (now - rec.last_op))
        return False, f"cooldown: {remaining}s remaining"
    return True, ""


def _record_op(name: str) -> None:
    now = time.monotonic()
    _op_records[name].timestamps.append(now)
    _op_records[name].last_op = now


# ── Public VM actions ─────────────────────────────────────────────────────────
def start_vm(name: str) -> dict:
    """Start a VM by name via libvirt API.  Requires name to be in the allowlist."""
    if name not in _VM_ALLOWLIST:
        return {"ok": False, "reason": "not in allowlist"}

    allowed, reason = _check_rate(name)
    if not allowed:
        return {"ok": False, "reason": reason}

    if _DRY_RUN:
        logger.info("[DRY_RUN] Would start VM: %s", name)
        return {"ok": True, "dry_run": True, "vm": name}

    try:
        import libvirt
    except ImportError:
        return {"ok": False, "reason": "libvirt-python not installed"}

    conn = None
    try:
        conn = libvirt.open(_LIBVIRT_URI)
        if conn is None:
            return {"ok": False, "reason": "libvirt connection failed"}
        dom = conn.lookupByName(name)
        dom.create()
        _record_op(name)
        logger.info("Started VM: %s", name)
        return {"ok": True, "vm": name}
    except Exception as exc:
        logger.error("VM start error for %s: %s", name, exc)
        return {"ok": False, "reason": str(exc)}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


def shutdown_vm(name: str) -> dict:
    """Issue a graceful ACPI shutdown to a VM via libvirt API."""
    if name not in _VM_ALLOWLIST:
        return {"ok": False, "reason": "not in allowlist"}

    allowed, reason = _check_rate(name)
    if not allowed:
        return {"ok": False, "reason": reason}

    if _DRY_RUN:
        logger.info("[DRY_RUN] Would shutdown VM: %s", name)
        return {"ok": True, "dry_run": True, "vm": name}

    try:
        import libvirt
    except ImportError:
        return {"ok": False, "reason": "libvirt-python not installed"}

    conn = None
    try:
        conn = libvirt.open(_LIBVIRT_URI)
        if conn is None:
            return {"ok": False, "reason": "libvirt connection failed"}
        dom = conn.lookupByName(name)
        dom.shutdown()
        _record_op(name)
        logger.info("Shutdown requested for VM: %s", name)
        return {"ok": True, "vm": name}
    except Exception as exc:
        logger.error("VM shutdown error for %s: %s", name, exc)
        return {"ok": False, "reason": str(exc)}
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass


# ── VM provisioning — PROPOSAL ONLY ──────────────────────────────────────────
_NAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-]{0,62}$')


def propose_vm_provision(reason: str, suggested_name: str) -> dict:
    """Send a human-ratification proposal to the governance signing relay.

    This function NEVER calls virt-install or any subprocess.  It only
    posts a JSON payload to the signing relay; a human operator must approve
    the proposal before any VM is actually created.
    """
    if not _NAME_RE.match(suggested_name):
        return {"ok": False, "reason": "invalid suggested_name format (alphanumeric + hyphens only)"}
    if len(reason) > 500:
        return {"ok": False, "reason": "reason exceeds 500 characters"}

    payload = json.dumps({
        "type": "vm_provision",
        "suggested_name": suggested_name,
        "reason": reason,
        "source": "gnmc",
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{_SIGNING_RELAY_URL}/proposals",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return {"ok": True, "relay_status": resp.status}
    except urllib.error.URLError as exc:
        logger.warning("Signing relay unreachable: %s", exc)
        return {"ok": False, "reason": str(exc)}
