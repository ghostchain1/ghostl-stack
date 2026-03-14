"""
GhostStack — VM Manager
========================
Wraps virsh (libvirt) to provide lifecycle management for all GhostStack VMs.

Safety invariants
-----------------
* DRY_RUN mode (env: VM_MANAGER_DRY_RUN=1): all write actions are logged but
  never executed.  This is the default in test/staging environments.
* Per-VM restart cooldown (default 120 s): prevents flapping repair storms.
* Per-VM circuit breaker: if a VM is restarted >MAX_RESTARTS_PER_HOUR (default
  4) within a rolling hour, further automatic restarts are blocked and the VM is
  escalated to GhostBrain for human review.
* ROUTING LAW is enforced at the topology level: no direct L3→L1 action is ever
  triggered.  L3 issues escalate through L2 first.
* Snapshots are created as safety checkpoints before any hard-restart or reboot.
  Auto-snapshot requires qemu storage backend with sufficient headroom.

Environments variables
----------------------
  VM_MANAGER_DRY_RUN          1 to skip all write actions (default: 0)
  VM_MANAGER_COOLDOWN_S       per-VM restart cooldown in seconds (default: 120)
  VM_MANAGER_MAX_RESTARTS_H   max restarts per rolling hour (default: 4)
  VM_SNAPSHOT_ENABLED         1 to auto-snapshot before reboot (default: 1)
  VIRSH_URI                   libvirt connection URI (default: qemu:///system)
  VM_MGR_STATE_FILE           path to cooldown/circuit-breaker JSON
                              (default: <repo-root>/.tmp/vm_manager_state.json)
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple

log = logging.getLogger("vm_manager")

# ── Configuration ─────────────────────────────────────────────────────────────
DRY_RUN             = os.getenv("VM_MANAGER_DRY_RUN", "0") == "1"
COOLDOWN_S          = int(os.getenv("VM_MANAGER_COOLDOWN_S", "120"))
MAX_RESTARTS_HOUR   = int(os.getenv("VM_MANAGER_MAX_RESTARTS_H", "4"))
SNAPSHOT_ENABLED    = os.getenv("VM_SNAPSHOT_ENABLED", "1") == "1"
VIRSH_URI           = os.getenv("VIRSH_URI", "qemu:///system")

_REPO_ROOT = Path(__file__).resolve().parents[3]
STATE_FILE = Path(os.getenv("VM_MGR_STATE_FILE", str(_REPO_ROOT / ".tmp" / "vm_manager_state.json")))

# ── VM inventory (mirrors supervisor.py) ─────────────────────────────────────
@dataclass(frozen=True)
class VM:
    name:      str
    role:      str            # l1 | l2 | l3 | web | dns | devnet
    static_ip: Optional[str] = None


VMS: List[VM] = [
    VM("ghost-dns-slave",         "dns",    "10.50.99.66"),
    VM("ghost-web",               "web",    "10.50.99.10"),
    VM("ghostchain-devnet",       "devnet", "10.50.99.45"),
    VM("ghostchain-testnet-l1",   "l1",     "10.50.99.71"),
    VM("ghost-testnet-validator", "l1",     "10.50.99.73"),
    VM("ghostl2-testnet",         "l2",     "10.50.99.77"),
    VM("ghostl3-testnet",         "l3",     "10.50.99.79"),
    VM("ghostchain-mainnet-l1",   "l1",     "10.50.99.70"),
    VM("ghost-mainnet-validator", "l1",     "10.50.99.72"),
    VM("ghostl2-mainnet",         "l2",     "10.50.99.76"),
    VM("ghostl3-mainnet",         "l3",     "10.50.99.78"),
]

VM_BY_NAME: Dict[str, VM] = {v.name: v for v in VMS}

# ── Boot order — lower number = boot first ────────────────────────────────────
# Routing law: L1 → L2 → L3 (startup); L3 → L2 → L1 (settlement flow)
_BOOT_ORDER = {"l1": 10, "l2": 20, "l3": 30, "dns": 1, "web": 40, "devnet": 5}


def boot_priority(vm: VM) -> int:
    return _BOOT_ORDER.get(vm.role, 99)


# ── Circuit-breaker state (in-memory + persisted to JSON) ────────────────────
@dataclass
class VMState:
    restart_times: Deque[float] = field(default_factory=lambda: deque(maxlen=24))
    last_restart:  float        = 0.0
    escalated:     bool         = False


_state_cache: Dict[str, VMState] = {}


def _load_state() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        return
    try:
        raw = json.loads(STATE_FILE.read_text())
        for name, d in raw.items():
            s = VMState()
            s.restart_times = deque(d.get("restart_times", []), maxlen=24)
            s.last_restart  = float(d.get("last_restart", 0))
            s.escalated     = bool(d.get("escalated", False))
            _state_cache[name] = s
    except Exception as exc:
        log.warning("Could not load VM manager state: %s", exc)


def _save_state() -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        out: Dict = {}
        for name, s in _state_cache.items():
            out[name] = {
                "restart_times": list(s.restart_times),
                "last_restart":  s.last_restart,
                "escalated":     s.escalated,
            }
        STATE_FILE.write_text(json.dumps(out, indent=2))
    except Exception as exc:
        log.warning("Could not persist VM manager state: %s", exc)


def _vm_state(name: str) -> VMState:
    if name not in _state_cache:
        _state_cache[name] = VMState()
    return _state_cache[name]


# ── virsh wrapper ─────────────────────────────────────────────────────────────
def _virsh(*args: str, timeout: int = 15) -> Tuple[int, str]:
    cmd = ["virsh", "-c", VIRSH_URI, *args]
    if DRY_RUN:
        log.info("[DRY-RUN] virsh %s", " ".join(args))
        return 0, "(dry-run)"
    try:
        p = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
        return p.returncode, (p.stdout or "").strip()
    except subprocess.TimeoutExpired:
        return 124, "timeout"
    except Exception as exc:
        return 999, f"{type(exc).__name__}: {exc}"


# ── State queries ─────────────────────────────────────────────────────────────
def get_state(name: str) -> str:
    """Returns 'running', 'shut off', 'paused', 'unknown', etc."""
    rc, out = _virsh("domstate", name)
    if rc != 0:
        return "unknown"
    return (out.splitlines() or ["unknown"])[-1].strip().lower()


def list_running() -> List[str]:
    """Return names of VMs currently in 'running' state."""
    rc, out = _virsh("list", "--state-running", "--name")
    if rc != 0:
        return []
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def list_all() -> List[Tuple[str, str]]:
    """Return (name, state) for all defined VMs."""
    results: List[Tuple[str, str]] = []
    for vm in VMS:
        results.append((vm.name, get_state(vm.name)))
    return results


# ── Cooldown + circuit-breaker guards ────────────────────────────────────────
def _assert_restartable(name: str) -> None:
    """Raise RuntimeError if the VM is on cooldown or circuit-broken."""
    s = _vm_state(name)
    if s.escalated:
        raise RuntimeError(
            f"{name}: circuit breaker open — escalated to GhostBrain. "
            "Clear via vm_manager.clear_escalation(name) after human review."
        )
    now = time.time()
    if now - s.last_restart < COOLDOWN_S:
        remaining = int(COOLDOWN_S - (now - s.last_restart))
        raise RuntimeError(
            f"{name}: restart cooldown active — {remaining}s remaining."
        )
    # Rolling 1-hour window
    cutoff = now - 3600
    recent = [t for t in s.restart_times if t >= cutoff]
    if len(recent) >= MAX_RESTARTS_HOUR:
        s.escalated = True
        _save_state()
        raise RuntimeError(
            f"{name}: circuit breaker triggered — {len(recent)} restarts in the last hour "
            f"(max {MAX_RESTARTS_HOUR}). Escalated to GhostBrain."
        )


def _record_restart(name: str) -> None:
    s = _vm_state(name)
    now = time.time()
    s.restart_times.append(now)
    s.last_restart = now
    _save_state()


def clear_escalation(name: str) -> None:
    """Human-triggered: reset circuit breaker after manual inspection."""
    s = _vm_state(name)
    s.escalated = False
    s.restart_times.clear()
    s.last_restart = 0.0
    _save_state()
    log.info("%s: escalation cleared — circuit breaker reset.", name)


# ── Snapshot ──────────────────────────────────────────────────────────────────
def snapshot(name: str, label: str = "auto") -> bool:
    """Create a timestamped internal snapshot. Returns True on success."""
    snap_name = f"gais-{label}-{int(time.time())}"
    log.info("%s: creating snapshot %s …", name, snap_name)
    rc, out = _virsh("snapshot-create-as", name, snap_name,
                     "--description", f"GAIS auto-checkpoint: {label}",
                     timeout=60)
    if rc != 0:
        log.warning("%s: snapshot failed: %s", name, out)
        return False
    log.info("%s: snapshot %s created.", name, snap_name)
    return True


# ── Lifecycle actions ─────────────────────────────────────────────────────────
def vm_start(name: str) -> bool:
    """Start a stopped VM. Returns True on success."""
    state = get_state(name)
    if state == "running":
        log.info("%s: already running — skipping start.", name)
        return True
    log.info("%s: starting (current state=%s)…", name, state)
    rc, out = _virsh("start", name, timeout=30)
    if rc != 0:
        log.error("%s: start failed: %s", name, out)
        return False
    log.info("%s: started.", name)
    return True


def vm_shutdown(name: str, graceful: bool = True) -> bool:
    """Shutdown a VM (graceful ACPI or forced destroy)."""
    if graceful:
        log.info("%s: graceful ACPI shutdown…", name)
        rc, out = _virsh("shutdown", name, timeout=20)
    else:
        log.warning("%s: forced destroy…", name)
        rc, out = _virsh("destroy", name, timeout=15)
    if rc != 0:
        log.error("%s: shutdown failed: %s", name, out)
        return False
    return True


def vm_reboot(name: str, force: bool = False, checkpoint: bool = True) -> bool:
    """
    Reboot a running VM.

    1. Optional snapshot checkpoint.
    2. Reboot (ACPI) or hard reset (force=True).
    """
    _assert_restartable(name)
    if checkpoint and SNAPSHOT_ENABLED:
        snapshot(name, "pre-reboot")
    log.info("%s: rebooting (force=%s)…", name, force)
    cmd = "reset" if force else "reboot"
    rc, out = _virsh(cmd, name, timeout=30)
    if rc != 0:
        log.error("%s: reboot failed: %s", name, out)
        return False
    _record_restart(name)
    log.info("%s: reboot issued.", name)
    return True


def vm_restart(name: str, force_shutdown: bool = False) -> bool:
    """
    Graceful (or forced) shutdown → start cycle.

    Used when the guest OS must reinitialise completely (not just reboot).
    """
    _assert_restartable(name)
    if SNAPSHOT_ENABLED:
        snapshot(name, "pre-restart")
    log.info("%s: restart — shutting down (force=%s)…", name, force_shutdown)
    ok = vm_shutdown(name, graceful=not force_shutdown)
    if not ok:
        log.warning("%s: shutdown step failed — attempting forced destroy before start.", name)
        vm_shutdown(name, graceful=False)
    # Wait for the VM to reach 'shut off'
    for _ in range(30):
        time.sleep(2)
        if get_state(name) == "shut off":
            break
    log.info("%s: starting…", name)
    ok = vm_start(name)
    if ok:
        _record_restart(name)
    return ok


def vm_suspend(name: str) -> bool:
    """Suspend (pause) a running VM."""
    log.info("%s: suspending…", name)
    rc, out = _virsh("suspend", name, timeout=15)
    if rc != 0:
        log.error("%s: suspend failed: %s", name, out)
        return False
    return True


def vm_resume(name: str) -> bool:
    """Resume a suspended VM."""
    log.info("%s: resuming…", name)
    rc, out = _virsh("resume", name, timeout=15)
    if rc != 0:
        log.error("%s: resume failed: %s", name, out)
        return False
    return True


# ── Bulk operations ───────────────────────────────────────────────────────────
def start_all_in_order() -> None:
    """
    Start all defined VMs in boot-priority order (L1 first, L3 last).
    """
    ordered = sorted(VMS, key=boot_priority)
    log.info("Starting %d VMs in boot order…", len(ordered))
    for vm in ordered:
        state = get_state(vm.name)
        if state == "running":
            log.info("  %s: already running — skip.", vm.name)
            continue
        log.info("  %s: starting…", vm.name)
        ok = vm_start(vm.name)
        if not ok:
            log.warning("  %s: start FAILED — continuing with remaining VMs.", vm.name)
        time.sleep(2)  # brief stagger between starts


def shutdown_all_in_reverse_order(graceful: bool = True) -> None:
    """
    Shutdown all VMs in reverse boot order (L3 first, L1 last).
    Ensures dependent layers drain before settlement layer stops.
    """
    ordered = sorted(VMS, key=boot_priority, reverse=True)
    log.info("Shutting down %d VMs in reverse boot order…", len(ordered))
    for vm in ordered:
        state = get_state(vm.name)
        if state == "shut off":
            log.info("  %s: already stopped — skip.", vm.name)
            continue
        log.info("  %s: shutting down…", vm.name)
        vm_shutdown(vm.name, graceful=graceful)
        time.sleep(1)


# ── Initialise state on import ────────────────────────────────────────────────
_load_state()
