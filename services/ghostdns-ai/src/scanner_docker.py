from __future__ import annotations

from typing import Dict


def scan_docker_records(domain: str) -> Dict[str, str]:
    records: Dict[str, str] = {}
    try:
        import docker  # lazy import for tests without docker socket

        client = docker.DockerClient(base_url="unix://var/run/docker.sock")
        for container in client.containers.list():
            name = container.name.lower().replace("_", "-")
            networks = (container.attrs.get("NetworkSettings") or {}).get("Networks") or {}
            for network_name, network_info in networks.items():
                ip = str(network_info.get("IPAddress") or "").strip()
                if not ip:
                    continue
                records[f"{name}.{domain}"] = ip
                records[f"{name}.{network_name}.{domain}"] = ip
    except Exception:
        return {}
    return records
