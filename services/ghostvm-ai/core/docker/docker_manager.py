from __future__ import annotations

import json
from typing import Any

from core.common import run_command


def discover_docker_state() -> dict[str, Any]:
    ls = run_command(["docker", "network", "ls", "--format", "{{json .}}"])
    rows = []
    if ls.get("ok") and ls.get("stdout"):
        for line in ls["stdout"].splitlines():
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return {
        "network_ls": ls,
        "network_count": len(rows),
        "networks": rows,
    }


def plan_docker_networks(ndsm: dict[str, Any]) -> list[dict[str, Any]]:
    managed = ((ndsm.get("docker") or {}).get("managed_networks") or [])
    actions: list[dict[str, Any]] = []
    for item in managed:
        name = item.get("name")
        subnet = item.get("subnet")
        gateway = item.get("gateway")
        actions.append(
            {
                "description": f"Ensure docker network {name}",
                "command": [
                    "bash",
                    "-lc",
                    f"docker network inspect {name} >/dev/null 2>&1 || docker network create --driver bridge --subnet {subnet} --gateway {gateway} {name}",
                ],
                "rollback": ["bash", "-lc", f"docker network rm {name} || true"],
                "destructive": False,
            }
        )
    return actions
