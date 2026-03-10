from prometheus_client import Counter, Gauge, Histogram

GHOSTDNS_RECONCILE_TOTAL = Counter("ghostdns_reconcile_total", "Total reconcile attempts")
GHOSTDNS_RECONCILE_FAIL_TOTAL = Counter("ghostdns_reconcile_fail_total", "Failed reconcile attempts")
GHOSTDNS_RELOAD_TOTAL = Counter("ghostdns_reload_total", "Total BIND reloads")
GHOSTDNS_NXDOMAIN_TOTAL = Counter("ghostdns_nxdomain_total", "NXDOMAIN responses observed")
GHOSTDNS_RECURSION_DENIED_TOTAL = Counter("ghostdns_recursion_denied_total", "Recursion denied checks")
GHOSTDNS_ZONE_SERIAL = Gauge("ghostdns_zone_serial", "Current zone serial")

# ── AI / intelligence metrics ─────────────────────────────────────────────────
GHOSTDNS_ANOMALY_DETECTED_TOTAL = Counter(
    "ghostdns_anomaly_detected_total", "DNS anomalies detected by AI", ["kind"]
)
GHOSTDNS_FAILOVER_TOTAL = Counter(
    "ghostdns_failover_total", "Automatic failover actions triggered"
)
GHOSTDNS_CERT_EXPIRY_DAYS = Gauge(
    "ghostdns_certificate_expiry_days", "Days until TLS certificate expiry", ["domain"]
)
GHOSTDNS_DOMAIN_EXPIRY_DAYS = Gauge(
    "ghostdns_domain_expiry_days", "Days until domain registration expiry", ["domain"]
)
GHOSTDNS_PROPAGATION_SECONDS = Histogram(
    "ghostdns_propagation_seconds",
    "DNS propagation latency in seconds",
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60],
)
GHOSTDNS_CLOUDFLARE_SYNC_TOTAL = Counter(
    "ghostdns_cloudflare_sync_total", "Cloudflare zone sync operations", ["status"]
)
GHOSTDNS_RECORD_OPS_TOTAL = Counter(
    "ghostdns_record_ops_total", "DNS record operations", ["rtype", "op"]
)

# ── Load balancer metrics ─────────────────────────────────────────────────────
GHOSTDNS_LB_SELECTION_TOTAL = Counter(
    "ghostdns_lb_selection_total", "LB backend selection requests", ["service"]
)
GHOSTDNS_LB_HEALTHY_BACKENDS = Gauge(
    "ghostdns_lb_healthy_backends", "Healthy backends per service pool", ["service"]
)

# ── DDoS guard metrics ────────────────────────────────────────────────────────
GHOSTDNS_DDOS_BLOCKED_IPS = Gauge(
    "ghostdns_ddos_blocked_ips", "Currently blocked source IPs"
)
GHOSTDNS_DDOS_RATE_EXCEEDED_TOTAL = Counter(
    "ghostdns_ddos_rate_exceeded_total", "Rate limit violations"
)

# ── Service mesh metrics ──────────────────────────────────────────────────────
GHOSTDNS_MESH_ENDPOINTS_TOTAL = Gauge(
    "ghostdns_mesh_endpoints_total", "Discovered service mesh endpoints", ["source"]
)
