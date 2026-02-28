from __future__ import annotations

from typing import Any

from core.common import run_command


def discover_hypervisor_state() -> dict[str, Any]:
    net_list = run_command(["virsh", "net-list", "--all"])
    ip_link = run_command(["ip", "link"])
    bridge_link = run_command(["bridge", "link"])
    ip_route = run_command(["ip", "route"])
    ip_rule = run_command(["ip", "rule"])
    nft = run_command(["nft", "list", "ruleset"])

    return {
        "net_list": net_list,
        "ip_link": ip_link,
        "bridge_link": bridge_link,
        "ip_route": ip_route,
        "ip_rule": ip_rule,
        "nftables": nft,
    }


def plan_hypervisor_bridges(ndsm: dict[str, Any]) -> list[dict[str, Any]]:
    bridges = (ndsm.get("hypervisor") or {}).get("bridges") or []
    actions: list[dict[str, Any]] = []
    for bridge in bridges:
        name = bridge.get("name")
        actions.append(
            {
                "description": f"Ensure bridge {name}",
                "command": ["bash", "-lc", f"ip link show {name} >/dev/null 2>&1 || ip link add {name} type bridge"],
                "rollback": ["bash", "-lc", f"ip link del {name} || true"],
                "destructive": False,
            }
        )
    return actions
