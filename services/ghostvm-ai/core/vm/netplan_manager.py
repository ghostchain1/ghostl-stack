from __future__ import annotations

from typing import Any

from core.common import run_command


def discover_vm_network_state() -> dict[str, Any]:
    return {
        "ip_a": run_command(["ip", "a"]),
        "ip_r": run_command(["ip", "r"]),
        "resolv_conf": run_command(["bash", "-lc", "cat /etc/resolv.conf"]),
        "nftables": run_command(["nft", "list", "ruleset"]),
        "networkd": run_command(["networkctl", "status"]),
    }


def plan_vm_network(ndsm: dict[str, Any]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for vm in ndsm.get("vms") or []:
        role = vm.get("role")
        name = vm.get("name")
        interfaces = vm.get("interfaces") or []
        actions.append(
            {
                "description": f"Validate network config for VM {name} ({role})",
                "command": ["bash", "-lc", f"echo validate-vm-network {name}"],
                "rollback": ["bash", "-lc", "echo no-op"],
                "destructive": False,
            }
        )
        for interface in interfaces:
            ifname = interface.get("name")
            segment = interface.get("segment")
            address = interface.get("address")
            gateway = interface.get("gateway")
            gateway_cmd = f" gw={gateway}" if gateway else ""
            actions.append(
                {
                    "description": f"Configure interface {ifname} on VM {name} for {segment}",
                    "command": [
                        "bash",
                        "-lc",
                        f"echo configure-netplan vm={name} if={ifname} segment={segment} addr={address}{gateway_cmd}",
                    ],
                    "rollback": [
                        "bash",
                        "-lc",
                        f"echo rollback-netplan vm={name} if={ifname}",
                    ],
                    "destructive": False,
                }
            )
    return actions
