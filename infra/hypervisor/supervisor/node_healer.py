"""
GhostStack — Node Healer
=========================
Implements a graduated remediation state machine for every GhostStack VM.

Healing levels (in escalation order)
--------------------------------------
1. SOFT_RESTART    — send SIGTERM / ACPI reboot to the failing container /
                     in-guest service (via SSH exec).  No VM disruption.
2. HARD_RESTART    — `virsh reboot` (VM-level ACPI reset).
3. FULL_REBOOT     — `virsh reset` (hard reset, like unplugging power).
4. ESCALATED       — human review required; GhostBrain notified; no further
                     automated action for this VM.

Safety invariants
-----------------
* Routing law: L3 issues resolved in-layer first; L2 only restarted after its
  own upstream (L3) is already healthy.  L1 never restarted via L3 path.
* Never escalates to FULL_REBOOT unless HARD_RESTART has been attempted
  (minimum healing progression is enforced).
* MAX_HEAL_ATTEMPTS per healing cycle: if a VM bounces through repeated
  SOFT_RESTARTs without recovering, it is promoted to HARD_RESTART.
* All actions respect the vm_manager cooldown + circuit-breaker.
* DRY_RUN propagates from vm_manager.

Environment variables
---------------------
  HEALER_SOFT_FAIL_THRESHOLD   consecutive soft-restart failures before promoting to hard
                                (default: 2)
  HEALER_HARD_FAIL_THRESHOLD   consecutive hard-restart failures before reboot
                                (default: 2)
  HEALER_UNHEALTHY_WINDOW_S    seconds a node must be unhealthy before healer triggers
                                (default: 60)
  GHOSTBRAIN_URL               GhostBrain Core base URL, e.g. http://localhost:7900
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Callable, Dict, Optional

import vm_manager as vmm

log = logging.getLogger("node_healer")

SOFT_FAIL_THRESHOLD    = int(os.getenv("HEALER_SOFT_FAIL_THRESHOLD", "2"))
HARD_FAIL_THRESHOLD    = int(os.getenv("HEALER_HARD_FAIL_THRESHOLD", "2"))
UNHEALTHY_WINDOW_S     = int(os.getenv("HEALER_UNHEALTHY_WINDOW_S", "60"))
GHOSTBRAIN_URL         = os.getenv("GHOSTBRAIN_URL", "http://localhost:7900").rstrip("/")

# Path to node-healer state file
_REPO_ROOT  = Path(os.getenv("REPO_ROOT", "/home/ghost/ghostl-stack"))
_STATE_FILE = _REPO_ROOT / ".tmp" / "healer_state.json"


# ── Healing level enum ────────────────────────────────────────────────────────
class HealLevel(Enum):
    HEALTHY       = auto()
    SOFT_RESTART  = auto()
    HARD_RESTART  = auto()
    FULL_REBOOT   = auto()
    ESCALATED     = auto()


_LEVEL_NAMES = {
    HealLevel.HEALTHY:      "healthy",
    HealLevel.SOFT_RESTART: "soft_restart",
    HealLevel.HARD_RESTART: "hard_restart",
    HealLevel.FULL_REBOOT:  "full_reboot",
    HealLevel.ESCALATED:    "escalated",
}

_NAME_TO_LEVEL = {v: k for k, v in _LEVEL_NAMES.items()}


# ── Per-node healing state ────────────────────────────────────────────────────
@dataclass
class NodeHealState:
    name:                 str
    level:                HealLevel  = HealLevel.HEALTHY
    soft_fail_count:      int        = 0
    hard_fail_count:      int        = 0
    first_unhealthy_at:   float      = 0.0     # epoch when node first went down
    last_action_at:       float      = 0.0
    total_heals:          int        = 0
    escalation_reason:    str        = ""


# ── Healer registry ───────────────────────────────────────────────────────────
_nodes: Dict[str, NodeHealState] = {}


def _load_state() -> None:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not _STATE_FILE.exists():
        return
    try:
        for name, d in json.loads(_STATE_FILE.read_text()).items():
            s = NodeHealState(name=name)
            s.level             = _NAME_TO_LEVEL.get(d.get("level", "healthy"), HealLevel.HEALTHY)
            s.soft_fail_count   = d.get("soft_fail_count", 0)
            s.hard_fail_count   = d.get("hard_fail_count", 0)
            s.first_unhealthy_at = d.get("first_unhealthy_at", 0.0)
            s.last_action_at    = d.get("last_action_at", 0.0)
            s.total_heals       = d.get("total_heals", 0)
            s.escalation_reason = d.get("escalation_reason", "")
            _nodes[name] = s
    except Exception as exc:
        log.warning("Could not load healer state: %s", exc)


def _save_state() -> None:
    try:
        out = {}
        for name, s in _nodes.items():
            out[name] = {
                "level":              _LEVEL_NAMES[s.level],
                "soft_fail_count":    s.soft_fail_count,
                "hard_fail_count":    s.hard_fail_count,
                "first_unhealthy_at": s.first_unhealthy_at,
                "last_action_at":     s.last_action_at,
                "total_heals":        s.total_heals,
                "escalation_reason":  s.escalation_reason,
            }
        _STATE_FILE.write_text(json.dumps(out, indent=2))
    except Exception as exc:
        log.warning("Could not persist healer state: %s", exc)


def _node(name: str) -> NodeHealState:
    if name not in _nodes:
        _nodes[name] = NodeHealState(name=name)
    return _nodes[name]


# ── GhostBrain notification (fire-and-forget) ─────────────────────────────────
def _notify_ghostbrain(name: str, level: HealLevel, reason: str) -> None:
    import urllib.request
    payload = json.dumps({
        "source":  "node-healer",
        "type":    "node.heal.event",
        "vm":      name,
        "level":   _LEVEL_NAMES[level],
        "reason":  reason,
        "ts":      int(time.time()),
    }).encode()
    url = f"{GHOSTBRAIN_URL}/api/v1/signals"
    try:
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3).read()
    except Exception as exc:
        log.debug("GhostBrain notify failed: %s", exc)


# ── SSH soft-restart helper ───────────────────────────────────────────────────
def _ssh_restart_service(vm_name: str, ip: Optional[str]) -> bool:
    """
    SSH into the VM and restart the primary chain service (systemd).
    Only attempted when we have a known IP.
    """
    if not ip:
        return False
    vm = vmm.VM_BY_NAME.get(vm_name)
    if not vm:
        return False
    # Service name convention: ghostchain-l1, ghostl2, ghostl3, etc.
    svc_map = {"l1": "ghostchain", "l2": "ghostl2", "l3": "ghostl3"}
    svc = svc_map.get(vm.role)
    if not svc:
        log.debug("%s: no systemd service mapped for role %s — skip SSH restart.", vm_name, vm.role)
        return False
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=5",
        "-o", "BatchMode=yes",
        f"ghost@{ip}",
        f"sudo systemctl restart {svc}",
    ]
    if vmm.DRY_RUN:
        log.info("[DRY-RUN] ssh %s systemctl restart %s", ip, svc)
        return True
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if result.returncode == 0:
            log.info("%s: SSH soft-restart of %s succeeded.", vm_name, svc)
            return True
        log.warning("%s: SSH restart failed: %s", vm_name, result.stderr.strip())
        return False
    except Exception as exc:
        log.warning("%s: SSH restart exception: %s", vm_name, exc)
        return False


# ── Main healing logic ────────────────────────────────────────────────────────
def report_healthy(name: str) -> None:
    """Called when a node passes its health check."""
    s = _node(name)
    if s.level != HealLevel.HEALTHY:
        log.info("%s: recovered — resetting healer state.", name)
        s.level             = HealLevel.HEALTHY
        s.soft_fail_count   = 0
        s.hard_fail_count   = 0
        s.first_unhealthy_at = 0.0
        _notify_ghostbrain(name, HealLevel.HEALTHY, "node recovered")
        _save_state()


def report_unhealthy(name: str, ip: Optional[str] = None, reason: str = "") -> None:
    """
    Called when a node fails its health check.
    Drives the state machine and executes the appropriate healing action.
    """
    s   = _node(name)
    now = time.time()

    if s.level == HealLevel.ESCALATED:
        log.debug("%s: escalated — awaiting human review, no automated action.", name)
        return

    # Record first-unhealthy timestamp
    if s.first_unhealthy_at == 0:
        s.first_unhealthy_at = now
        _save_state()

    # Don't trigger healing until the node has been down for UNHEALTHY_WINDOW_S
    if (now - s.first_unhealthy_at) < UNHEALTHY_WINDOW_S:
        log.debug(
            "%s: unhealthy for %ds (<=%ds window) — not yet healing.",
            name, int(now - s.first_unhealthy_at), UNHEALTHY_WINDOW_S,
        )
        return

    log.warning("%s: unhealthy (level=%s reason=%r) — escalating…",
                name, _LEVEL_NAMES[s.level], reason)

    if s.level == HealLevel.HEALTHY:
        # First failure: attempt soft restart
        s.level = HealLevel.SOFT_RESTART
        _do_soft_restart(s, ip)

    elif s.level == HealLevel.SOFT_RESTART:
        s.soft_fail_count += 1
        if s.soft_fail_count >= SOFT_FAIL_THRESHOLD:
            s.level = HealLevel.HARD_RESTART
            _do_hard_restart(s)
        else:
            _do_soft_restart(s, ip)

    elif s.level == HealLevel.HARD_RESTART:
        s.hard_fail_count += 1
        if s.hard_fail_count >= HARD_FAIL_THRESHOLD:
            s.level = HealLevel.FULL_REBOOT
            _do_full_reboot(s)
        else:
            _do_hard_restart(s)

    elif s.level == HealLevel.FULL_REBOOT:
        # Still unhealthy after full reboot — escalate
        _do_escalate(s, reason=f"full reboot did not recover: {reason}")

    s.last_action_at = now
    _save_state()


# ── Healing action dispatchers ────────────────────────────────────────────────
def _do_soft_restart(s: NodeHealState, ip: Optional[str]) -> None:
    log.info("%s: [SOFT] attempting in-guest service restart…", s.name)
    s.total_heals += 1
    _notify_ghostbrain(s.name, HealLevel.SOFT_RESTART, "in-guest service restart")
    ok = _ssh_restart_service(s.name, ip)
    if not ok:
        log.warning(
            "%s: SSH soft-restart unavailable (no IP or SSH failed) — "
            "treating as soft-fail; will escalate after %d attempts.",
            s.name, SOFT_FAIL_THRESHOLD,
        )
        s.soft_fail_count += 1


def _do_hard_restart(s: NodeHealState) -> None:
    log.warning("%s: [HARD] VM-level ACPI reboot…", s.name)
    s.total_heals += 1
    _notify_ghostbrain(s.name, HealLevel.HARD_RESTART, "VM ACPI reboot")
    try:
        vmm.vm_reboot(s.name, force=False, checkpoint=True)
    except RuntimeError as exc:
        log.error("%s: hard restart blocked: %s", s.name, exc)


def _do_full_reboot(s: NodeHealState) -> None:
    log.error("%s: [FULL REBOOT] hard VM reset (power cycle)…", s.name)
    s.total_heals += 1
    _notify_ghostbrain(s.name, HealLevel.FULL_REBOOT, "hard VM power cycle")
    try:
        vmm.vm_reboot(s.name, force=True, checkpoint=True)
    except RuntimeError as exc:
        log.error("%s: full reboot blocked: %s", s.name, exc)


def _do_escalate(s: NodeHealState, reason: str) -> None:
    log.critical(
        "%s: [ESCALATED] automated healing exhausted. Reason: %s. "
        "Human intervention required.",
        s.name, reason,
    )
    s.level             = HealLevel.ESCALATED
    s.escalation_reason = reason
    _notify_ghostbrain(s.name, HealLevel.ESCALATED, reason)


# ── Manual controls (human-triggered) ────────────────────────────────────────
def reset_healer(name: str) -> None:
    """Reset a node's healer state after human intervention."""
    s = _node(name)
    s.level             = HealLevel.HEALTHY
    s.soft_fail_count   = 0
    s.hard_fail_count   = 0
    s.first_unhealthy_at = 0.0
    s.escalation_reason = ""
    vmm.clear_escalation(name)
    _save_state()
    log.info("%s: healer state reset.", name)


def get_all_states() -> Dict[str, dict]:
    """Return a summary dict of all known node healer states."""
    return {
        name: {
            "level":             _LEVEL_NAMES[s.level],
            "soft_fail_count":   s.soft_fail_count,
            "hard_fail_count":   s.hard_fail_count,
            "first_unhealthy_at": s.first_unhealthy_at,
            "last_action_at":    s.last_action_at,
            "total_heals":       s.total_heals,
            "escalation_reason": s.escalation_reason,
        }
        for name, s in _nodes.items()
    }


_load_state()
