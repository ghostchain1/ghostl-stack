"""VM discovery via libvirt read-only API — no subprocess, no shell invocation."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_LIBVIRT_URI: str = os.getenv("GNMC_LIBVIRT_URI", "qemu:///system")
# Only enumerate VMs whose name starts with this prefix (empty = all)
_VM_NAME_PREFIX: str = os.getenv("GNMC_VM_NAME_PREFIX", "ghost")

# libvirt state IDs → human-readable strings
_STATE_NAMES: dict[int, str] = {
    0: "nostate",
    1: "running",
    2: "blocked",
    3: "paused",
    4: "shutdown",
    5: "shut off",
    6: "crashed",
    7: "pm suspended",
}


@dataclass
class VMInfo:
    name: str
    state: str       # e.g. "running", "shut off", "crashed"
    uuid: str = ""


def list_vms() -> list[VMInfo]:
    """Return VMs visible in the hypervisor, filtered by name prefix.

    Uses a read-only libvirt connection — never issues any mutation.
    Returns an empty list if libvirt-python is not installed or the
    hypervisor is unreachable; logs a warning rather than raising.
    """
    try:
        import libvirt  # optional; graceful degradation if not installed
    except ImportError:
        logger.warning(
            "libvirt-python not installed — VM listing unavailable. "
            "Install 'libvirt-python' to enable hypervisor integration."
        )
        return []

    conn = None
    try:
        conn = libvirt.openReadOnly(_LIBVIRT_URI)
        if conn is None:
            logger.error("libvirt openReadOnly returned None for URI=%s", _LIBVIRT_URI)
            return []

        vms: list[VMInfo] = []
        for domain in conn.listAllDomains():
            name: str = domain.name()
            if _VM_NAME_PREFIX and not name.startswith(_VM_NAME_PREFIX):
                continue
            state_id, _ = domain.state()
            vms.append(VMInfo(
                name=name,
                state=_STATE_NAMES.get(state_id, "unknown"),
                uuid=domain.UUIDString(),
            ))
        return vms

    except Exception as exc:
        logger.error("libvirt scan error: %s", exc)
        return []
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
