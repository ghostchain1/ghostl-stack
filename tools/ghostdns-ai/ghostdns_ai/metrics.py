from prometheus_client import Counter, start_http_server

DNS_QUERIES_TOTAL = Counter("dns_queries_total", "Total hostname health-resolve checks")
DNS_FAILED_QUERIES = Counter("dns_failed_queries", "Failed hostname health-resolve checks")
DNS_RELOAD_COUNT = Counter("dns_reload_count", "Total DNS reload operations")
DNS_AI_ACTIONS_TOTAL = Counter("dns_ai_actions_total", "Automated AI actions taken")
STALE_RECORD_CLEANUP_TOTAL = Counter("stale_record_cleanup_total", "Stale records removed")


def start_metrics_server(host: str, port: int) -> None:
    start_http_server(port, addr=host)
