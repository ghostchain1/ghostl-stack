from pathlib import Path

from core.hypervisor.nftables_manager import render_hypervisor_rules
from core.planner import build_plan


def test_nftables_rules_contains_bridges() -> None:
    rules = render_hypervisor_rules()
    assert "br-l3" in rules
    assert "br-l2" in rules
    assert "br-l1" in rules


def test_plan_build(tmp_path: Path) -> None:
    ndsm = {
        "network_segments": {
            "mgmt": {"cidr": "10.10.0.0/24"},
            "l1": {"cidr": "10.20.0.0/24"},
            "l2": {"cidr": "10.30.0.0/24"},
            "l3": {"cidr": "10.40.0.0/24"},
            "external": {"cidr": "208.110.71.128/26"},
        },
        "hypervisor": {"bridges": [{"name": "br-l1"}]},
        "docker": {"managed_networks": [{"name": "n1", "subnet": "172.31.0.0/24", "gateway": "172.31.0.1"}]},
        "vms": [
            {
                "name": "vm1",
                "role": "l1",
                "interfaces": [
                    {"name": "ens3", "segment": "l1", "address": "10.20.0.10/24"},
                    {"name": "ens4", "segment": "external", "address": "208.110.71.171/26", "gateway": "208.110.71.129"},
                ],
            }
        ],
    }
    policy = {
        "rules": [
            {"from": "l3", "to": "l2", "action": "allow"},
            {"from": "l3", "to": "l1", "action": "deny"},
            {"from": "l3", "to": "external", "action": "deny"},
            {"from": "l2", "to": "l1", "action": "allow"},
            {"from": "l2", "to": "external", "action": "deny"},
            {"from": "l1", "to": "external", "action": "allow"},
        ]
    }
    out = build_plan(ndsm, policy, {"docker": {"network_count": 1}}, tmp_path)
    assert out["ok"]
    assert out["plan"]["actions"]
    assert any("Configure interface ens4" in a["description"] for a in out["plan"]["actions"])
