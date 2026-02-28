from prometheus_client import Counter, Gauge

GHOSTDNS_RECONCILE_TOTAL = Counter("ghostdns_reconcile_total", "Total reconcile attempts")
GHOSTDNS_RECONCILE_FAIL_TOTAL = Counter("ghostdns_reconcile_fail_total", "Failed reconcile attempts")
GHOSTDNS_RELOAD_TOTAL = Counter("ghostdns_reload_total", "Total BIND reloads")
GHOSTDNS_NXDOMAIN_TOTAL = Counter("ghostdns_nxdomain_total", "NXDOMAIN responses observed")
GHOSTDNS_RECURSION_DENIED_TOTAL = Counter("ghostdns_recursion_denied_total", "Recursion denied checks")
GHOSTDNS_ZONE_SERIAL = Gauge("ghostdns_zone_serial", "Current zone serial")
