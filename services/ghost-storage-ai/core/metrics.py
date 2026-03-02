from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# ── Discovery ─────────────────────────────────────────────────────────────────
DISCOVERY_TOTAL        = Counter("gsa_discovery_total", "Total discovery runs")
DISCOVERY_ERRORS_TOTAL = Counter("gsa_discovery_errors_total", "Discovery runs with SSH errors")

# ── Analysis findings ─────────────────────────────────────────────────────────
FINDINGS_CRIT = Gauge("gsa_findings_crit", "Number of CRIT storage findings last scan")
FINDINGS_WARN = Gauge("gsa_findings_warn", "Number of WARN storage findings last scan")

# ── Per-VM disk usage ─────────────────────────────────────────────────────────
VM_DISK_USAGE_PCT = Gauge(
    "gsa_vm_disk_use_pct",
    "Filesystem use percent per VM mount",
    ["vm", "mount"],
)
VM_JOURNAL_MB = Gauge(
    "gsa_vm_journal_mb",
    "systemd journal disk usage in MB",
    ["vm"],
)
VM_APT_CACHE_MB = Gauge(
    "gsa_vm_apt_cache_mb",
    "APT package cache size in MB",
    ["vm"],
)
VM_TMP_MB = Gauge(
    "gsa_vm_tmp_mb",
    "/tmp size in MB",
    ["vm"],
)

# ── Hypervisor pool ───────────────────────────────────────────────────────────
HV_POOL_USE_PCT = Gauge(
    "gsa_hv_pool_use_pct",
    "Libvirt storage pool use percent",
    ["pool"],
)
HV_POOL_AVAIL_GB = Gauge(
    "gsa_hv_pool_avail_gb",
    "Libvirt storage pool available GB",
    ["pool"],
)

# ── qcow2 images ─────────────────────────────────────────────────────────────
QCOW_ALLOC_PCT = Gauge(
    "gsa_qcow_allocated_pct",
    "qcow2 actual/virtual allocation percent",
    ["vm"],
)
QCOW_ACTUAL_GB = Gauge(
    "gsa_qcow_actual_gb",
    "qcow2 actual size on disk in GB",
    ["vm"],
)

# ── Apply results ─────────────────────────────────────────────────────────────
APPLY_TOTAL    = Counter("gsa_apply_total", "Total plan apply runs")
APPLY_ACTIONS_OK    = Counter("gsa_apply_actions_ok_total", "Apply actions succeeded")
APPLY_ACTIONS_FAIL  = Counter("gsa_apply_actions_failed_total", "Apply actions failed")

# ── Reconcile loop ────────────────────────────────────────────────────────────
RECONCILE_DURATION = Histogram(
    "gsa_reconcile_duration_seconds",
    "Full reconcile loop duration",
    buckets=[5, 15, 30, 60, 120, 300],
)


def update_from_snapshot(snapshot: dict) -> None:
    """Push latest discovered metrics into Prometheus gauges."""
    for vm in snapshot.get("vms", []):
        name: str = vm.get("vm", "unknown")
        if vm.get("error"):
            continue
        for m in vm.get("mounts", []):
            VM_DISK_USAGE_PCT.labels(vm=name, mount=m["mount"]).set(m.get("use_pct", 0))
        if vm.get("journal_mb") is not None:
            VM_JOURNAL_MB.labels(vm=name).set(vm["journal_mb"])
        if vm.get("apt_cache_mb") is not None:
            VM_APT_CACHE_MB.labels(vm=name).set(vm["apt_cache_mb"])
        if vm.get("tmp_mb") is not None:
            VM_TMP_MB.labels(vm=name).set(vm["tmp_mb"])

    hv = snapshot.get("hypervisor") or {}
    for pool in hv.get("pools", []):
        HV_POOL_USE_PCT.labels(pool=pool["name"]).set(pool.get("use_pct", 0))
        HV_POOL_AVAIL_GB.labels(pool=pool["name"]).set(pool.get("available_gb", 0))
    for img in hv.get("images", []):
        vm_name: str = img.get("vm", "unknown")
        QCOW_ALLOC_PCT.labels(vm=vm_name).set(img.get("allocated_pct", 0))
        QCOW_ACTUAL_GB.labels(vm=vm_name).set(img.get("actual_size_gb", 0))
