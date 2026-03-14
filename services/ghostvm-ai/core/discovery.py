from __future__ import annotations

from pathlib import Path
from typing import Any

from core.common import ensure_dir, utc_ts, write_json
from core.docker.docker_manager import discover_docker_state
from core.hypervisor.libvirt_manager import discover_hypervisor_state
from core.vm.netplan_manager import discover_vm_network_state


def run_discovery(state_dir: Path) -> dict[str, Any]:
    ts = utc_ts()
    target = ensure_dir(state_dir / "discovery" / ts)

    hypervisor = discover_hypervisor_state()
    vm_state = discover_vm_network_state()
    docker_state = discover_docker_state()

    snapshot = {
        "timestamp": ts,
        "hypervisor": hypervisor,
        "vm": vm_state,
        "docker": docker_state,
    }
    write_json(target / "snapshot.json", snapshot)
    return {"ok": True, "timestamp": ts, "path": str(target), "snapshot": snapshot}
