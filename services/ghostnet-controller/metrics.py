"""Prometheus metrics for GhostStack Network Master Controller (GNMC)."""
from prometheus_client import Counter, Gauge, Histogram

# ── VM metrics ────────────────────────────────────────────────────────────────
GNMC_VM_SCAN_TOTAL = Counter(
    "gnmc_vm_scan_total",
    "Total VM discovery scans performed via libvirt",
)
GNMC_VM_COUNT = Gauge(
    "gnmc_vm_count",
    "Number of VMs detected by state",
    ["state"],
)
GNMC_VM_ACTION_TOTAL = Counter(
    "gnmc_vm_action_total",
    "VM start / shutdown actions dispatched",
    ["name", "action"],
)
GNMC_VM_PROVISION_PROPOSALS_TOTAL = Counter(
    "gnmc_vm_provision_proposals_total",
    "VM provisioning proposals sent to signing relay",
    ["status"],
)

# ── Container metrics ─────────────────────────────────────────────────────────
GNMC_CONTAINER_COUNT = Gauge(
    "gnmc_container_count",
    "Number of containers by status",
    ["status"],
)
GNMC_CONTAINER_RESTARTS_TOTAL = Counter(
    "gnmc_container_restarts_total",
    "Container restarts executed by GNMC",
    ["name"],
)

# ── Network metrics ───────────────────────────────────────────────────────────
GNMC_DNS_SYNC_TOTAL = Counter(
    "gnmc_dns_sync_total",
    "DNS upsert calls forwarded to ghostdns-ai",
    ["status"],
)
GNMC_LB_SYNC_TOTAL = Counter(
    "gnmc_lb_sync_total",
    "Load-balancer queries forwarded to ghostdns-ai",
    ["status"],
)

# ── AI / GhostBrain metrics ───────────────────────────────────────────────────
GNMC_BRAIN_QUERY_TOTAL = Counter(
    "gnmc_brain_query_total",
    "Queries forwarded to GhostBrain Core",
    ["status"],
)
GNMC_HEALTH_SCORE = Gauge(
    "gnmc_health_score",
    "Computed infrastructure health score (0–100)",
)

# ── Loop metrics ──────────────────────────────────────────────────────────────
GNMC_LOOP_DURATION_SECONDS = Histogram(
    "gnmc_loop_duration_seconds",
    "Wall-clock time for one GNMC controller loop iteration",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# ── System metrics ────────────────────────────────────────────────────────────
GNMC_SYSTEM_CPU_LOAD = Gauge(
    "gnmc_system_cpu_load_1m",
    "Host CPU 1-minute load average",
)
GNMC_SYSTEM_MEMORY_FREE_BYTES = Gauge(
    "gnmc_system_memory_free_bytes",
    "Host available memory in bytes",
)
