from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from core.common import ensure_dir, read_yaml, utc_ts, write_json
from core.hypervisor.libvirt_storage import discover_hypervisor_storage
from core.hypervisor.vm_ssh import get_vm_disk_snapshot
from core.models import StorageSnapshot, VMDiskSnapshot
from core.settings import ssh_key_path, ssh_timeout, ssh_user

log = logging.getLogger("ghost-storage-ai.discovery")


def _load_vm_targets(config_dir: Path) -> list[dict[str, str]]:
    """Load VM targets from storage-desired-state.yaml."""
    cfg = read_yaml(config_dir / "storage-desired-state.yaml")
    return cfg.get("vms", [])


def run_discovery(config_dir: Path, state_dir: Path) -> dict[str, Any]:
    ts = utc_ts()
    targets = _load_vm_targets(config_dir)
    user = ssh_user()
    key = ssh_key_path()
    timeout = ssh_timeout()

    vm_snapshots: list[VMDiskSnapshot] = []

    def probe_vm(t: dict[str, str]) -> VMDiskSnapshot:
        name = t.get("name", "unknown")
        host = t.get("host", "")
        log.info("Probing VM %s (%s)…", name, host)
        return get_vm_disk_snapshot(name, host, user=user, key=key, timeout=timeout)

    # Probe all VMs concurrently (max 8 workers to avoid SSH flooding)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(probe_vm, t): t for t in targets}
        for fut in as_completed(futs):
            try:
                vm_snapshots.append(fut.result())
            except Exception as exc:  # noqa: BLE001
                t = futs[fut]
                log.warning("Probe failed for %s: %s", t.get("name"), exc)
                vm_snapshots.append(VMDiskSnapshot(
                    vm=t.get("name", "unknown"),
                    host=t.get("host", ""),
                    error=str(exc),
                ))

    # Hypervisor libvirt/qcow2 discovery
    log.info("Discovering hypervisor storage pools and qcow2 images…")
    try:
        hv_snap = discover_hypervisor_storage()
    except Exception as exc:  # noqa: BLE001
        log.error("Hypervisor discovery failed: %s", exc)
        from core.models import HypervisorStorageSnapshot
        hv_snap = HypervisorStorageSnapshot(error=str(exc))

    snapshot = StorageSnapshot(timestamp=ts, vms=vm_snapshots, hypervisor=hv_snap)

    # Persist state
    snapshot_dict = _snapshot_to_dict(snapshot)
    state_path = ensure_dir(state_dir) / "latest-snapshot.json"
    write_json(state_path, snapshot_dict)
    log.info("Discovery complete: %d VMs probed, %d pools, %d images",
             len(vm_snapshots),
             len(hv_snap.pools) if hv_snap else 0,
             len(hv_snap.images) if hv_snap else 0)
    return {"timestamp": ts, "snapshot": snapshot_dict}


def _snapshot_to_dict(s: StorageSnapshot) -> dict[str, Any]:
    return {
        "timestamp": s.timestamp,
        "vms": [
            {
                "vm": v.vm,
                "host": v.host,
                "error": v.error,
                "mounts": [
                    {
                        "device": m.device,
                        "mount": m.mount,
                        "total_kb": m.total_kb,
                        "used_kb": m.used_kb,
                        "avail_kb": m.avail_kb,
                        "use_pct": m.use_pct,
                    }
                    for m in v.mounts
                ],
                "journal_mb": v.journal.disk_usage_mb if v.journal else None,
                "apt_cache_mb": v.apt_cache.cache_size_mb if v.apt_cache else None,
                "tmp_mb": v.tmp.tmp_size_mb if v.tmp else None,
            }
            for v in s.vms
        ],
        "hypervisor": {
            "pools": [
                {
                    "name": p.name,
                    "state": p.state,
                    "capacity_gb": p.capacity_gb,
                    "allocation_gb": p.allocation_gb,
                    "available_gb": p.available_gb,
                    "use_pct": p.use_pct,
                }
                for p in s.hypervisor.pools
            ] if s.hypervisor else [],
            "images": [
                {
                    "vm": i.vm,
                    "path": i.path,
                    "format": i.disk_format,
                    "virtual_size_gb": i.virtual_size_gb,
                    "actual_size_gb": i.actual_size_gb,
                    "allocated_pct": i.allocated_pct,
                }
                for i in s.hypervisor.images
            ] if s.hypervisor else [],
            "error": s.hypervisor.error if s.hypervisor else None,
        } if s.hypervisor else None,
    }
