from pathlib import Path

from core.evidence_bundle import (
    bundle_verify_exit_code,
    create_evidence_bundle,
    create_evidence_bundle_include_all,
    verify_evidence_bundle,
)


def test_create_evidence_bundle(tmp_path: Path) -> None:
    root = tmp_path
    plans = root / "plans" / "20260227T000000Z"
    evidence = root / "evidence" / "20260227T000100Z"
    plans.mkdir(parents=True)
    evidence.mkdir(parents=True)

    (plans / "plan.json").write_text("{}", encoding="utf-8")
    (plans / "diff.md").write_text("# diff", encoding="utf-8")
    (plans / "nft-remediation.json").write_text("{}", encoding="utf-8")
    (evidence / "network-verification.json").write_text("{}", encoding="utf-8")

    out = create_evidence_bundle(root=root, plans_dir=root / "plans", evidence_dir=root / "evidence")
    assert out["ok"]
    assert out["files"]
    assert Path(out["archive"]).exists()


def test_create_evidence_bundle_include_all(tmp_path: Path) -> None:
    root = tmp_path
    for i in range(3):
        plan = root / "plans" / f"20260227T00010{i}Z"
        ev = root / "evidence" / f"20260227T00020{i}Z"
        plan.mkdir(parents=True)
        ev.mkdir(parents=True)
        (plan / "plan.json").write_text("{}", encoding="utf-8")
        (ev / "network-verification.json").write_text("{}", encoding="utf-8")

    out = create_evidence_bundle_include_all(
        root=root,
        plans_dir=root / "plans",
        evidence_dir=root / "evidence",
        depth=2,
    )
    assert out["ok"]
    assert out["mode"] == "include_all"
    assert len(out["source"]["plans"]) == 2
    assert len(out["source"]["verification"]) == 2
    assert Path(out["archive"]).exists()


def test_create_evidence_bundle_signed_custom_output(tmp_path: Path) -> None:
    root = tmp_path
    plans = root / "plans" / "20260227T000000Z"
    evidence = root / "evidence" / "20260227T000100Z"
    plans.mkdir(parents=True)
    evidence.mkdir(parents=True)

    (plans / "plan.json").write_text("{}", encoding="utf-8")
    (evidence / "network-verification.json").write_text("{}", encoding="utf-8")

    out = create_evidence_bundle(
        root=root,
        plans_dir=root / "plans",
        evidence_dir=root / "evidence",
        output="/tmp/ghostvm-ai-bundles-test",
        sign=True,
    )
    assert out["ok"]
    assert "signing" in out
    assert out["signing"]["archive_sha256"]
    assert out["archive"].startswith("/tmp/ghostvm-ai-bundles-test/")


def test_verify_evidence_bundle_signed_ok(tmp_path: Path) -> None:
    root = tmp_path
    plans = root / "plans" / "20260227T000000Z"
    evidence = root / "evidence" / "20260227T000100Z"
    plans.mkdir(parents=True)
    evidence.mkdir(parents=True)
    (plans / "plan.json").write_text("{}", encoding="utf-8")
    (evidence / "network-verification.json").write_text("{}", encoding="utf-8")

    out = create_evidence_bundle(root=root, plans_dir=root / "plans", evidence_dir=root / "evidence", sign=True)
    verify = verify_evidence_bundle(out["bundle_dir"])
    assert verify["ok"]


def test_verify_evidence_bundle_tampered_archive_fails(tmp_path: Path) -> None:
    root = tmp_path
    plans = root / "plans" / "20260227T000000Z"
    evidence = root / "evidence" / "20260227T000100Z"
    plans.mkdir(parents=True)
    evidence.mkdir(parents=True)
    (plans / "plan.json").write_text("{}", encoding="utf-8")
    (evidence / "network-verification.json").write_text("{}", encoding="utf-8")

    out = create_evidence_bundle(root=root, plans_dir=root / "plans", evidence_dir=root / "evidence", sign=True)
    archive = Path(out["archive"])
    archive.write_bytes(archive.read_bytes() + b"tamper")

    verify = verify_evidence_bundle(out["bundle_dir"])
    assert not verify["ok"]
    names = {c["name"]: c for c in verify["checks"]}
    assert not names["archive_sha256"]["ok"]
    assert bundle_verify_exit_code(verify) == 4


def test_bundle_verify_exit_code_manifest_missing(tmp_path: Path) -> None:
    verify = verify_evidence_bundle(str(tmp_path / "missing-bundle"))
    assert bundle_verify_exit_code(verify) == 2
