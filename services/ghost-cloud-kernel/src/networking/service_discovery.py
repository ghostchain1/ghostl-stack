"""Docker-based service discovery — builds a name→endpoint map for ghost-* services.

Returns only service name, inferred port, and container status.
Internal container IPs are provided as-is for internal mesh use;
they are never exposed on public API endpoints without auth gating.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Only discover containers whose name matches this prefix
_NAME_PREFIX: str = os.getenv("GACK_SERVICE_PREFIX", "ghost")

# Well-known port inference table (container name prefix → default port)
_PORT_HINTS: dict[str, int] = {
    "ghostbrain":       7900,
    "ghostdns":         18089,
    "ghostnet":         4060,
    "ghost-cloud":      4070,
    "ghost-api":        3001,
    "ghost-web":        3000,
    "ghost-explorer":   3002,
    "grafana":          3000,
    "prometheus":       9090,
    "ghostchain":       18545,
    "ghostl2":          29547,
    "ghostl3":          39545,
    "redis":            6379,
    "postgres":         5432,
}


@dataclass
class ServiceEndpoint:
    name: str
    container_id: str
    status: str
    ip: str
    port: int
    image: str


def _infer_port(name: str) -> int:
    for prefix, port in _PORT_HINTS.items():
        if name.startswith(prefix):
            return port
    return 80


def discover_services() -> list[ServiceEndpoint]:
    """Return all running ghost-* containers as ServiceEndpoint objects."""
    try:
        import docker
        client = docker.from_env()
    except Exception as exc:
        logger.warning("Docker unavailable for service discovery: %s", exc)
        return []

    services: list[ServiceEndpoint] = []
    try:
        for c in client.containers.list(all=True):
            name: str = c.name or c.short_id
            if not name.startswith(_NAME_PREFIX):
                continue

            # Extract the first non-loopback IP from docker networks
            ip = ""
            try:
                nets = c.attrs.get("NetworkSettings", {}).get("Networks", {})
                for net_info in nets.values():
                    candidate = net_info.get("IPAddress", "")
                    if candidate and candidate != "127.0.0.1":
                        ip = candidate
                        break
            except Exception:
                pass

            image_tag = c.image.tags[0] if c.image.tags else "unknown"
            services.append(ServiceEndpoint(
                name=name,
                container_id=c.short_id,
                status=c.status,
                ip=ip,
                port=_infer_port(name),
                image=image_tag,
            ))
    except Exception as exc:
        logger.error("Service discovery scan error: %s", exc)

    return services
