from core.apply_engine import apply_plan
from core.planner import build_plan
from core.verify_engine import run_verification


def test_end_to_end_dry_run(tmp_path) -> None:
    ndsm = {
        "network_segments": {
            "mgmt": {"cidr": "10.10.0.0/24"},
            "l1": {"cidr": "10.20.0.0/24"},
            "l2": {"cidr": "10.30.0.0/24"},
            "l3": {"cidr": "10.40.0.0/24"},
            "external": {"cidr": "208.110.71.128/26"},
        },
        "hypervisor": {"bridges": [{"name": "br-l1"}, {"name": "br-l2"}, {"name": "br-l3"}]},
        "docker": {"managed_networks": [{"name": "ghost-devnet", "subnet": "172.31.0.0/24", "gateway": "172.31.0.1"}]},
        "vms": [{"name": "l1", "role": "l1"}, {"name": "l2", "role": "l2"}, {"name": "l3", "role": "l3"}],
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
    discovered = {"docker": {"network_count": 2}}

    plan_res = build_plan(ndsm, policy, discovered, tmp_path / "plans")
    assert plan_res["ok"]

    apply_res = apply_plan(
        plan=plan_res["plan"],
        plans_dir=tmp_path / "plans",
        approvals_dir=tmp_path / "governance" / "approvals",
        apply_enabled=False,
        dry_run=True,
    )
    assert apply_res["ok"]

    verify_res = run_verification(ndsm, policy, tmp_path / "evidence", discovered)
    assert "checks" in verify_res
