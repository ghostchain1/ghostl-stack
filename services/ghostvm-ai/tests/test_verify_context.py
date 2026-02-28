from core import verify_engine


def _base_ndsm_policy():
    ndsm = {
        "network_segments": {
            "mgmt": {"cidr": "10.10.0.0/24"},
            "l1": {"cidr": "10.20.0.0/24"},
            "l2": {"cidr": "10.30.0.0/24"},
            "l3": {"cidr": "10.40.0.0/24"},
            "external": {"cidr": "208.110.71.128/26"},
        }
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
    return ndsm, policy


def test_verify_host_context_skips_l3_probes(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()

    def fake_run(_cmd, timeout=3):
        return {"ok": False, "stderr": "blocked"}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(ndsm, policy, tmp_path / "evidence", context="host")
    details = {c["name"]: c for c in out["checks"]}
    assert details["l3_to_l2_reachability_probe"]["details"] == "skipped_non_l3_context"
    assert out["ok"]


def test_verify_l3_context_enforces_l3_probes(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()

    def fake_run(cmd, timeout=3):
        text = " ".join(cmd)
        if "10.30.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "op-gate" in text:
            return {"ok": True, "stderr": ""}
        if "10.20.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "8.8.8.8" in text:
            return {"ok": False, "stderr": ""}
        return {"ok": True, "stderr": ""}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(
        ndsm,
        policy,
        tmp_path / "evidence",
        context="l3",
        probe_source="ghost-l3-test",
    )
    assert out["ok"]


def test_verify_l3_with_probe_source_uses_docker_exec(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()
    calls = []

    def fake_run(cmd, timeout=3):
        calls.append(cmd)
        text = " ".join(cmd)
        if "10.30.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "op-gate" in text:
            return {"ok": True, "stderr": ""}
        if "10.20.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "8.8.8.8" in text:
            return {"ok": False, "stderr": ""}
        return {"ok": True, "stderr": ""}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(
        ndsm,
        policy,
        tmp_path / "evidence",
        context="l3",
        probe_source="ghost-l3-container",
    )
    assert out["ok"]
    assert any(cmd[:3] == ["docker", "exec", "ghost-l3-container"] for cmd in calls)


def test_verify_l3_auto_selects_probe_source_by_label(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()
    ndsm["docker"] = {"enforce_labels": {"l3": "ghost.layer=l3"}}

    calls = []

    def fake_run(cmd, timeout=3):
        calls.append(cmd)
        text = " ".join(cmd)
        if cmd[:3] == ["docker", "ps", "--filter"]:
            return {"ok": True, "stdout": "ghost-l3-auto", "stderr": ""}
        if "10.30.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "op-gate" in text:
            return {"ok": True, "stderr": ""}
        if "10.20.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "8.8.8.8" in text:
            return {"ok": False, "stderr": ""}
        return {"ok": True, "stderr": ""}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(ndsm, policy, tmp_path / "evidence", context="l3")
    assert out["ok"]
    assert out["probe_source"] == "ghost-l3-auto"
    assert out["probe_source_strategy"] == "label"
    assert any(cmd[:3] == ["docker", "exec", "ghost-l3-auto"] for cmd in calls)


def test_verify_l3_without_probe_source_fails_closed(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()

    def fake_run(cmd, timeout=3):
        if cmd[:3] == ["docker", "ps", "--filter"]:
            return {"ok": True, "stdout": "", "stderr": ""}
        if cmd[:3] == ["docker", "network", "inspect"]:
            return {"ok": False, "stdout": "", "stderr": "not found"}
        return {"ok": True, "stdout": "", "stderr": ""}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(ndsm, policy, tmp_path / "evidence", context="l3")
    assert not out["ok"]
    checks = {c["name"]: c for c in out["checks"]}
    assert checks["l3_to_l2_reachability_probe"]["details"] == "no_l3_probe_source"


def test_verify_l3_network_fallback_prefers_l3_named_container(tmp_path, monkeypatch):
    ndsm, policy = _base_ndsm_policy()
    calls = []

    def fake_run(cmd, timeout=3):
        calls.append(cmd)
        if cmd[:3] == ["docker", "ps", "--filter"]:
            return {"ok": True, "stdout": "", "stderr": ""}
        if cmd[:3] == ["docker", "network", "inspect"]:
            return {"ok": True, "stdout": "ghostl-testnet-op-gate-1\nghostl-testnet-l3-geth-1", "stderr": ""}
        text = " ".join(cmd)
        if "10.30.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "op-gate" in text:
            return {"ok": True, "stderr": ""}
        if "10.20.0.10" in text:
            return {"ok": False, "stderr": ""}
        if "8.8.8.8" in text:
            return {"ok": False, "stderr": ""}
        return {"ok": True, "stderr": ""}

    monkeypatch.setattr(verify_engine, "run_command", fake_run)
    out = verify_engine.run_verification(ndsm, policy, tmp_path / "evidence", context="l3")
    assert out["probe_source"] == "ghostl-testnet-l3-geth-1"
    assert out["probe_source_strategy"] == "network"
