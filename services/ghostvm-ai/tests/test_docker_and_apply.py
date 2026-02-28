from pathlib import Path

from core.apply_engine import apply_plan
from core.docker import docker_manager


def test_discover_docker_state_parse(monkeypatch) -> None:
    def fake_run(_cmd, timeout=20):
        return {
            "ok": True,
            "stdout": '{"Name":"bridge","Driver":"bridge"}\n{"Name":"ghost-devnet","Driver":"bridge"}',
            "stderr": "",
            "returncode": 0,
        }

    monkeypatch.setattr(docker_manager, "run_command", fake_run)
    state = docker_manager.discover_docker_state()
    assert state["network_count"] == 2


def test_apply_plan_dry_run(tmp_path: Path) -> None:
    plans_dir = tmp_path / "plans"
    approvals = tmp_path / "governance" / "approvals"
    (plans_dir / "p1").mkdir(parents=True)
    plan = {
        "id": "p1",
        "routing_ok": True,
        "actions": [
            {
                "id": "a1",
                "command": ["echo", "ok"],
                "destructive": False,
            }
        ],
    }
    out = apply_plan(plan, plans_dir, approvals, apply_enabled=False, dry_run=True)
    assert out["ok"]
    assert out["results"][0]["dry_run"] is True
