from __future__ import annotations

"""
AI analyser — inspects the storage snapshot and produces findings.

Rules evaluated (in priority order):
  1. Disk filesystem usage above warn/crit thresholds
  2. Journal log size above threshold
  3. APT package cache size above threshold
  4. /tmp size above threshold
  5. qcow2 actual-to-virtual allocation above sparse threshold
  6. Libvirt storage pool above warn threshold
"""

import logging
from typing import Any

from core.models import Severity, StorageFinding
from core.settings import (
    apt_cache_warn_mb,
    disk_crit_pct,
    disk_warn_pct,
    journal_warn_mb,
    qcow_sparse_warn_pct,
    tmp_warn_mb,
)

log = logging.getLogger("ghost-storage-ai.analyser")

# ── Internal helpers ──────────────────────────────────────────────────────────

def _finding_id(vm: str, category: str, detail: str) -> str:
    slug = detail[:40].replace(" ", "-").replace("/", "_")
    return f"{vm}:{category}:{slug}"


# ── Per-VM analysis ───────────────────────────────────────────────────────────

def _analyse_vm(vm_dict: dict[str, Any]) -> list[StorageFinding]:
    findings: list[StorageFinding] = []
    name: str = vm_dict.get("vm", "unknown")
    error: str | None = vm_dict.get("error")

    if error:
        findings.append(StorageFinding(
            vm=name,
            category="unreachable",
            severity=Severity.CRIT,
            detail=f"SSH probe failed: {error}",
            metric_value=0.0,
            threshold=0.0,
        ))
        return findings

    warn_pct = disk_warn_pct()
    crit_pct = disk_crit_pct()

    # 1. Filesystem mounts
    for m in vm_dict.get("mounts", []):
        pct: int = m.get("use_pct", 0)
        if pct >= crit_pct:
            findings.append(StorageFinding(
                vm=name,
                category="disk_full",
                severity=Severity.CRIT,
                detail=f"{m['mount']} ({m['device']}) is {pct}% full",
                metric_value=float(pct),
                threshold=float(crit_pct),
            ))
        elif pct >= warn_pct:
            findings.append(StorageFinding(
                vm=name,
                category="disk_full",
                severity=Severity.WARN,
                detail=f"{m['mount']} ({m['device']}) is {pct}% full",
                metric_value=float(pct),
                threshold=float(warn_pct),
            ))

    # 2. Journal
    j_mb: float = vm_dict.get("journal_mb") or 0.0
    j_warn = journal_warn_mb()
    if j_mb >= j_warn:
        sev = Severity.CRIT if j_mb >= j_warn * 2 else Severity.WARN
        findings.append(StorageFinding(
            vm=name,
            category="journal",
            severity=sev,
            detail=f"systemd journal consuming {j_mb:.0f} MB",
            metric_value=j_mb,
            threshold=float(j_warn),
        ))

    # 3. APT cache
    apt_mb: float = vm_dict.get("apt_cache_mb") or 0.0
    apt_warn = apt_cache_warn_mb()
    if apt_mb >= apt_warn:
        findings.append(StorageFinding(
            vm=name,
            category="apt_cache",
            severity=Severity.WARN,
            detail=f"/var/cache/apt/archives is {apt_mb:.0f} MB",
            metric_value=apt_mb,
            threshold=float(apt_warn),
        ))

    # 4. /tmp
    tmp_mb: float = vm_dict.get("tmp_mb") or 0.0
    tmp_warn = tmp_warn_mb()
    if tmp_mb >= tmp_warn:
        findings.append(StorageFinding(
            vm=name,
            category="tmp",
            severity=Severity.WARN,
            detail=f"/tmp is {tmp_mb:.0f} MB",
            metric_value=tmp_mb,
            threshold=float(tmp_warn),
        ))

    return findings


# ── Hypervisor analysis ───────────────────────────────────────────────────────

def _analyse_hypervisor(hv_dict: dict[str, Any]) -> list[StorageFinding]:
    findings: list[StorageFinding] = []
    if not hv_dict:
        return findings

    error: str | None = hv_dict.get("error")
    if error:
        findings.append(StorageFinding(
            vm="hypervisor",
            category="hv_discovery",
            severity=Severity.CRIT,
            detail=f"libvirt discovery failed: {error}",
            metric_value=0.0,
            threshold=0.0,
        ))
        return findings

    warn_pct = disk_warn_pct()
    crit_pct = disk_crit_pct()

    # Storage pool usage
    for pool in hv_dict.get("pools", []):
        pct: float = pool.get("use_pct", 0.0)
        name: str = pool.get("name", "unknown")
        avail: float = pool.get("available_gb", 0.0)
        if pct >= crit_pct:
            findings.append(StorageFinding(
                vm="hypervisor",
                category="pool_full",
                severity=Severity.CRIT,
                detail=f"Storage pool '{name}' is {pct:.0f}% full ({avail:.1f} GB free)",
                metric_value=pct,
                threshold=float(crit_pct),
            ))
        elif pct >= warn_pct:
            findings.append(StorageFinding(
                vm="hypervisor",
                category="pool_full",
                severity=Severity.WARN,
                detail=f"Storage pool '{name}' is {pct:.0f}% full ({avail:.1f} GB free)",
                metric_value=pct,
                threshold=float(warn_pct),
            ))

    # qcow2 sparse inflation
    sparse_thresh = qcow_sparse_warn_pct()
    for img in hv_dict.get("images", []):
        alloc_pct: float = img.get("allocated_pct", 0.0)
        img_vm: str = img.get("vm", "unknown")
        path: str = img.get("path", "")
        virt_gb: float = img.get("virtual_size_gb", 0.0)
        actual_gb: float = img.get("actual_size_gb", 0.0)
        if alloc_pct >= sparse_thresh:
            sev = Severity.CRIT if alloc_pct >= 95 else Severity.WARN
            findings.append(StorageFinding(
                vm=img_vm,
                category="qcow_sparse",
                severity=sev,
                detail=f"qcow2 {path} is {alloc_pct:.0f}% allocated ({actual_gb:.1f}/{virt_gb:.1f} GB)",
                metric_value=alloc_pct,
                threshold=float(sparse_thresh),
            ))

    return findings


# ── Main entrypoint ───────────────────────────────────────────────────────────

def analyse_snapshot(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    """Return list of finding dicts from a discovered snapshot."""
    findings: list[StorageFinding] = []

    for vm in snapshot.get("vms", []):
        findings.extend(_analyse_vm(vm))

    hv = snapshot.get("hypervisor")
    if hv:
        findings.extend(_analyse_hypervisor(hv))

    # Sort: CRIT first, then WARN, then OK; within same sev by metric desc
    sev_order = {Severity.CRIT: 0, Severity.WARN: 1, Severity.OK: 2}
    findings.sort(key=lambda f: (sev_order[f.severity], -f.metric_value))

    if findings:
        crit = sum(1 for f in findings if f.severity == Severity.CRIT)
        warn = sum(1 for f in findings if f.severity == Severity.WARN)
        log.info("Analysis: %d CRIT, %d WARN findings", crit, warn)
    else:
        log.info("Analysis: all storage healthy")

    return [
        {
            "id": _finding_id(f.vm, f.category, f.detail),
            "vm": f.vm,
            "category": f.category,
            "severity": f.severity.value,
            "detail": f.detail,
            "metric_value": f.metric_value,
            "threshold": f.threshold,
        }
        for f in findings
    ]
