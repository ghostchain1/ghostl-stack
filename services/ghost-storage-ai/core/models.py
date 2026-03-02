from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


# ── Severity ─────────────────────────────────────────────────────────────────

class Severity(str, Enum):
    OK = "ok"
    WARN = "warn"
    CRIT = "crit"


# ── Paths ────────────────────────────────────────────────────────────────────

@dataclass(slots=True)
class Paths:
    root: Path
    config_dir: Path
    state_dir: Path
    plans_dir: Path
    evidence_dir: Path


# ── VM disk snapshot ─────────────────────────────────────────────────────────

@dataclass(slots=True)
class MountInfo:
    device: str
    mount: str
    total_kb: int
    used_kb: int
    avail_kb: int
    use_pct: int


@dataclass(slots=True)
class JournalInfo:
    disk_usage_mb: float        # journalctl --disk-usage
    largest_units: list[str] = field(default_factory=list)


@dataclass(slots=True)
class AptCacheInfo:
    cache_size_mb: float        # du of /var/cache/apt/archives


@dataclass(slots=True)
class TmpInfo:
    tmp_size_mb: float          # du of /tmp


@dataclass(slots=True)
class VMDiskSnapshot:
    vm: str
    host: str
    mounts: list[MountInfo] = field(default_factory=list)
    journal: JournalInfo | None = None
    apt_cache: AptCacheInfo | None = None
    tmp: TmpInfo | None = None
    error: str | None = None


# ── Libvirt / hypervisor ─────────────────────────────────────────────────────

@dataclass(slots=True)
class QcowImageInfo:
    vm: str
    path: str
    disk_format: str
    virtual_size_gb: float
    actual_size_gb: float
    allocated_pct: float        # actual / virtual * 100


@dataclass(slots=True)
class StoragePoolInfo:
    name: str
    state: str
    capacity_gb: float
    allocation_gb: float
    available_gb: float
    use_pct: float


@dataclass(slots=True)
class HypervisorStorageSnapshot:
    pools: list[StoragePoolInfo] = field(default_factory=list)
    images: list[QcowImageInfo] = field(default_factory=list)
    error: str | None = None


# ── Full discovery snapshot ───────────────────────────────────────────────────

@dataclass(slots=True)
class StorageSnapshot:
    timestamp: str
    vms: list[VMDiskSnapshot] = field(default_factory=list)
    hypervisor: HypervisorStorageSnapshot | None = None


# ── AI findings ──────────────────────────────────────────────────────────────

@dataclass(slots=True)
class StorageFinding:
    vm: str
    category: str               # disk_full | journal | apt_cache | tmp | qcow_sparse | pool_full
    severity: Severity
    detail: str
    metric_value: float         # e.g. use_pct or size_mb
    threshold: float


# ── Plan actions ─────────────────────────────────────────────────────────────

@dataclass(slots=True)
class StorageAction:
    id: str
    vm: str                     # "hypervisor" for host-side actions
    phase: str
    description: str
    command: list[str]          # executed on the target VM via SSH (or locally if vm=="hypervisor")
    destructive: bool = False
    rollback: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)  # finding ids that triggered this
