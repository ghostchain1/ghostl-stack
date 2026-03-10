"""
VM Manager — libvirt / KVM integration.

Controls VMs via the libvirt Python binding. Handles missing libvirt
gracefully so the module loads in environments without KVM.

Security: no shell=True, no string interpolation into commands.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

logger = logging.getLogger(__name__)

try:
    import libvirt  # type: ignore[import-untyped]
    _LIBVIRT_AVAILABLE = True
except ImportError:
    _LIBVIRT_AVAILABLE = False
    logger.warning("libvirt-python not installed — VMManager running in stub mode.")


class VMManager:
    """Manages libvirt domains (VMs)."""

    def __init__(self, uri: str = "qemu:///system") -> None:
        self._uri = uri
        self._conn: "libvirt.virConnect | None" = None

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def _connect(self) -> "libvirt.virConnect":
        if not _LIBVIRT_AVAILABLE:
            raise RuntimeError("libvirt-python not available.")
        if self._conn is None or not self._conn.isAlive():
            self._conn = libvirt.open(self._uri)
            if self._conn is None:
                raise RuntimeError(f"Failed to connect to libvirt at {self._uri!r}")
        return self._conn

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_vms(self) -> list[dict[str, str]]:
        """Return all domains as dicts with keys: name, state."""
        if not _LIBVIRT_AVAILABLE:
            return []
        conn = self._connect()
        result = []
        for dom in conn.listAllDomains():
            state_int, _ = dom.state()
            state = _libvirt_state(state_int)
            result.append({"name": dom.name(), "state": state})
        return result

    def restart_vm(self, name: str) -> None:
        """
        Start a shut-off domain, or reboot a running one.
        Name must be non-empty and not contain path separators.
        """
        _validate_name(name)
        if not _LIBVIRT_AVAILABLE:
            logger.warning("libvirt unavailable — cannot restart VM %r", name)
            return
        conn = self._connect()
        dom = conn.lookupByName(name)
        if dom.isActive():
            logger.info("Rebooting VM %r", name)
            dom.reboot()
        else:
            logger.info("Starting VM %r", name)
            dom.create()

    def shutdown_vm(self, name: str) -> None:
        """Attempt graceful shutdown of a running domain."""
        _validate_name(name)
        if not _LIBVIRT_AVAILABLE:
            return
        conn = self._connect()
        dom = conn.lookupByName(name)
        if dom.isActive():
            dom.shutdown()

    def is_running(self, name: str) -> bool:
        """Return True if the named domain is in running state."""
        _validate_name(name)
        if not _LIBVIRT_AVAILABLE:
            return False
        conn = self._connect()
        try:
            dom = conn.lookupByName(name)
            return bool(dom.isActive())
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_name(name: str) -> None:
    """Reject names that could be mis-interpreted as paths or shell tokens."""
    if not name or "/" in name or "\\" in name or ";" in name or "&" in name:
        raise ValueError(f"Invalid VM name: {name!r}")
    if len(name) > 128:
        raise ValueError("VM name too long (>128 chars)")


def _libvirt_state(state_int: int) -> str:
    # libvirt domain state constants (VIR_DOMAIN_*)
    _STATES = {
        0: "nostate",
        1: "running",
        2: "blocked",
        3: "paused",
        4: "shutdown",
        5: "shutoff",
        6: "crashed",
        7: "pmsuspended",
    }
    return _STATES.get(state_int, "unknown")
