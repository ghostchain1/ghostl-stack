"""Service mesh mapper for GhostDNS AI v2.

Combines container and VM discovery into a normalised service map that
associates logical service names with their network endpoints.  The map is
consumed by the LoadBalancer (bulk_register_from_map) so the LB pool
always reflects the live discovered topology.

No subprocess calls — relies entirely on scanner_docker (Docker SDK) and
scanner_libvirt (JSON lease file parsing).
"""
from __future__ import annotations

from dataclasses import dataclass

from src.metrics import GHOSTDNS_MESH_ENDPOINTS_TOTAL


@dataclass
class ServiceEndpoint:
    name: str       # logical service name (e.g. "ghostbrain-core")
    ip: str
    port: int       # inferred from service name; default 80
    source: str     # "docker" | "libvirt"
    fqdn: str       # canonical FQDN in the internal zone


class ServiceMeshMapper:
    """Builds a service → endpoint map from live-discovered containers and VMs."""

    # Well-known service name → port mappings
    _PORT_HINTS: dict[str, int] = {
        "ghostbrain":   7900,
        "ghostx":       8181,
        "ghostscan":    8082,
        "api":          8080,
        "grafana":      3000,
        "prometheus":   9090,
        "redis":        6379,
        "postgres":     5432,
        "ghostdns":     18089,
        "l3fee":        7681,
        "l2revenue":    7682,
        "treasury":     7683,
        "reward":       7684,
        "governor":     7685,
        "compliance":   8090,
    }

    def __init__(self, domain: str) -> None:
        self._domain = domain

    def _infer_port(self, name: str) -> int:
        lower = name.lower()
        for prefix, port in self._PORT_HINTS.items():
            if prefix in lower:
                return port
        return 80

    def _make_fqdn(self, name: str) -> str:
        safe = name.lower().replace("_", "-").replace("/", "").lstrip("-")
        return f"{safe}.{self._domain}"

    def build_map(
        self,
        docker_records: dict[str, tuple[str, int]],
        libvirt_records: dict[str, tuple[str, int]],
    ) -> list[ServiceEndpoint]:
        """Build a list of service endpoints from scanner output dicts.

        ``docker_records`` and ``libvirt_records`` are ``{fqdn: (ip, ttl)}``
        dicts as returned by ``scanner_docker`` and ``scanner_libvirt``.
        """
        endpoints: list[ServiceEndpoint] = []

        def _add(records: dict[str, tuple[str, int]], source: str) -> None:
            for fqdn, (ip, _ttl) in records.items():
                name = fqdn.replace(f".{self._domain}", "")
                port = self._infer_port(name)
                endpoints.append(ServiceEndpoint(
                    name=name, ip=ip, port=port, source=source, fqdn=fqdn,
                ))

        _add(docker_records, "docker")
        _add(libvirt_records, "libvirt")

        docker_count = sum(1 for e in endpoints if e.source == "docker")
        libvirt_count = sum(1 for e in endpoints if e.source == "libvirt")
        GHOSTDNS_MESH_ENDPOINTS_TOTAL.labels(source="docker").set(docker_count)
        GHOSTDNS_MESH_ENDPOINTS_TOTAL.labels(source="libvirt").set(libvirt_count)

        return endpoints

    def to_lb_map(self, endpoints: list[ServiceEndpoint]) -> dict[str, list[dict]]:
        """Return a ``{service: [{ip, port, weight, region}]}`` dict for
        ``LoadBalancer.bulk_register_from_map()``."""
        result: dict[str, list[dict]] = {}
        for ep in endpoints:
            result.setdefault(ep.name, []).append({
                "ip": ep.ip,
                "port": ep.port,
                "weight": 100,
                "region": "local",
            })
        return result

    def to_api_list(self, endpoints: list[ServiceEndpoint]) -> list[dict]:
        return [
            {
                "name": ep.name,
                "ip": ep.ip,
                "port": ep.port,
                "source": ep.source,
                "fqdn": ep.fqdn,
            }
            for ep in endpoints
        ]
