from core import remediation


def test_remediation_plan_dry_run_success(tmp_path, monkeypatch):
    def fake_run(cmd, timeout=5):
        text = " ".join(cmd)
        if "ghost_l1_net" in text:
            return {"ok": True, "stdout": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "stderr": ""}
        if "ghost_l2_net" in text:
            return {"ok": True, "stdout": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "stderr": ""}
        if "ghost_l3_net" in text:
            return {"ok": True, "stdout": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "stderr": ""}
        if "ip route show default" in text:
            return {"ok": True, "stdout": "eth0", "stderr": ""}
        return {"ok": True, "stdout": "", "stderr": ""}

    monkeypatch.setattr(remediation, "run_command", fake_run)
    out = remediation.create_nft_remediation_plan(tmp_path, apply=False)
    assert out["ok"]
    assert out["dry_run"]
    assert out["bridges"]["l3"] == "br-cccccccccccc"


def test_remediation_plan_missing_network_fails(tmp_path, monkeypatch):
    def fake_run(cmd, timeout=5):
        text = " ".join(cmd)
        if "ghost_l1_net" in text:
            return {"ok": False, "stdout": "", "stderr": "not found"}
        if "ip route show default" in text:
            return {"ok": True, "stdout": "eth0", "stderr": ""}
        return {"ok": True, "stdout": "", "stderr": ""}

    monkeypatch.setattr(remediation, "run_command", fake_run)
    out = remediation.create_nft_remediation_plan(tmp_path, apply=False)
    assert not out["ok"]
