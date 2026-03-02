from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.common import run_local
from core.models import HypervisorStorageSnapshot, QcowImageInfo, StoragePoolInfo

log = logging.getLogger("ghost-storage-ai.libvirt_storage")


def _gb(val: str) -> float:
    """Convert virsh size strings like '50.00 GiB', '500 MiB', '10.5TiB' → GB."""
    val = val.strip()
    m = re.match(r"([\d.]+)\s*(G|GiB|GB|M|MiB|MB|T|TiB|TB|K|KiB|KB)?", val, re.IGNORECASE)
    if not m:
        return 0.0
    num = float(m.group(1))
    unit = (m.group(2) or "G").upper()
    if unit.startswith("T"):
        return num * 1024
    if unit.startswith("G"):
        return num
    if unit.startswith("M"):
        return num / 1024
    if unit.startswith("K"):
        return num / (1024 * 1024)
    return num


def _list_pool_names() -> list[str]:
    rc, out, _ = run_local(["virsh", "pool-list", "--all"])
    names: list[str] = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith("Name") or line.startswith("----"):
            continue
        parts = line.split()
        if parts:
            names.append(parts[0])
    return names


def _get_pool_info(pool: str) -> StoragePoolInfo | None:
    rc, out, _ = run_local(["virsh", "pool-info", pool])
    if rc != 0:
        return None
    info: dict[str, str] = {}
    for line in out.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            info[k.strip()] = v.strip()
    try:
        cap_gb = _gb(info.get("Capacity", "0"))
        alloc_gb = _gb(info.get("Allocation", "0"))
        avail_gb = _gb(info.get("Available", "0"))
        use_pct = round(alloc_gb / cap_gb * 100, 1) if cap_gb > 0 else 0.0
        return StoragePoolInfo(
            name=pool,
            state=info.get("State", "unknown"),
            capacity_gb=cap_gb,
            allocation_gb=alloc_gb,
            available_gb=avail_gb,
            use_pct=use_pct,
        )
    except (ValueError, ZeroDivisionError):
        return None


def _list_all_domains() -> list[str]:
    rc, out, _ = run_local(["virsh", "list", "--all"])
    domains: list[str] = []
    for line in out.splitlines():
        line = line.strip()
        if not line or line.startswith("Id") or line.startswith("--"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            domains.append(parts[1])
    return domains


def _get_domain_disks(domain: str) -> list[str]:
    """Return list of disk image paths for a domain."""
    rc, out, _ = run_local(["virsh", "domblklist", domain, "--details"])
    if rc != 0:
        return []
    paths: list[str] = []
    for line in out.splitlines():
        parts = line.split()
        # columns: type, device, target, source — skip lines without source
        if len(parts) >= 4 and parts[0] == "file":
            paths.append(parts[3])
    return paths


def _get_qcow_info(vm: str, path: str) -> QcowImageInfo | None:
    rc, out, _ = run_local(["qemu-img", "info", "--output=json", path])
    if rc != 0:
        return None
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return None
    virt_bytes = data.get("virtual-size", 0)
    actual_bytes = data.get("actual-size", 0)
    virt_gb = round(virt_bytes / (1024 ** 3), 2)
    actual_gb = round(actual_bytes / (1024 ** 3), 2)
    alloc_pct = round(actual_gb / virt_gb * 100, 1) if virt_gb > 0 else 0.0
    return QcowImageInfo(
        vm=vm,
        path=path,
        disk_format=data.get("format", "unknown"),
        virtual_size_gb=virt_gb,
        actual_size_gb=actual_gb,
        allocated_pct=alloc_pct,
    )


def discover_hypervisor_storage() -> HypervisorStorageSnapshot:
    pools: list[StoragePoolInfo] = []
    for name in _list_pool_names():
        info = _get_pool_info(name)
        if info:
            pools.append(info)

    images: list[QcowImageInfo] = []
    for domain in _list_all_domains():
        for disk_path in _get_domain_disks(domain):
            if disk_path and (disk_path.endswith(".qcow2") or disk_path.endswith(".img")):
                img = _get_qcow_info(domain, disk_path)
                if img:
                    images.append(img)

    return HypervisorStorageSnapshot(pools=pools, images=images)
