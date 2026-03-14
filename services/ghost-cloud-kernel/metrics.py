"""Prometheus metrics for the GhostStack Autonomous Cloud Kernel (GACK)."""
from prometheus_client import Counter, Gauge, Histogram

# ── Kernel loop ───────────────────────────────────────────────────────────────
GACK_LOOP_TOTAL = Counter(
    "gack_loop_total",
    "Total kernel loop iterations",
)
GACK_LOOP_DURATION_SECONDS = Histogram(
    "gack_loop_duration_seconds",
    "Wall-clock time for one GACK kernel loop iteration",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# ── Infrastructure — VMs ──────────────────────────────────────────────────────
GACK_VM_SCAN_TOTAL = Counter(
    "gack_vm_scan_total",
    "Total hypervisor VM scans performed",
)
GACK_VM_COUNT = Gauge(
    "gack_vm_count",
    "Number of detected VMs by state",
    ["state"],
)
GACK_VM_SCALE_PROPOSALS_TOTAL = Counter(
    "gack_vm_scale_proposals_total",
    "VM scale-out proposals sent to signing relay",
    ["status"],
)

# ── Infrastructure — containers ───────────────────────────────────────────────
GACK_CONTAINER_COUNT = Gauge(
    "gack_container_count",
    "Number of containers by status",
    ["status"],
)
GACK_CONTAINER_HEALS_TOTAL = Counter(
    "gack_container_heals_total",
    "Container self-heal restarts executed by GACK",
    ["name"],
)

# ── Networking ────────────────────────────────────────────────────────────────
GACK_ROUTING_VIOLATION_TOTAL = Counter(
    "gack_routing_violation_total",
    "Routing law violations detected (e.g. L3→L1 direct)",
    ["source", "destination"],
)
GACK_SERVICES_DISCOVERED = Gauge(
    "gack_services_discovered",
    "Number of services in the current discovery map",
)

# ── Blockchain ────────────────────────────────────────────────────────────────
GACK_CHAIN_BLOCK_HEIGHT = Gauge(
    "gack_chain_block_height",
    "Latest block number reported by each chain layer",
    ["layer"],
)
GACK_CHAIN_UP = Gauge(
    "gack_chain_up",
    "1 if chain RPC is reachable and chain ID matches, else 0",
    ["layer"],
)
GACK_CHAIN_ID_MISMATCH_TOTAL = Counter(
    "gack_chain_id_mismatch_total",
    "Chain ID mismatches detected (wrong RPC endpoint)",
    ["layer"],
)
GACK_TX_ROUTED_TOTAL = Counter(
    "gack_tx_routed_total",
    "Transactions routed by kernel (logical, not on-chain submissions)",
    ["source", "next_hop"],
)

# ── AI / decisions ────────────────────────────────────────────────────────────
GACK_DECISION_TOTAL = Counter(
    "gack_decision_total",
    "AI decision engine outcomes",
    ["decision"],
)
GACK_HEALTH_SCORE = Gauge(
    "gack_health_score",
    "Composite infrastructure health score (0–100)",
)
