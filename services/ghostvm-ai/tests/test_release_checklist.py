import json
import subprocess
from pathlib import Path

from core.evidence_bundle import create_evidence_bundle


def test_release_checklist_json_output_with_prebuilt_bundle(tmp_path: Path) -> None:
    root = tmp_path
    plans = root / "plans" / "20260227T000000Z"
    evidence = root / "evidence" / "20260227T000100Z"
    plans.mkdir(parents=True)
    evidence.mkdir(parents=True)
    (plans / "plan.json").write_text("{}", encoding="utf-8")
    (evidence / "network-verification.json").write_text("{}", encoding="utf-8")

    bundle = create_evidence_bundle(root=root, plans_dir=root / "plans", evidence_dir=root / "evidence", sign=True)
    bundle_dir = bundle["bundle_dir"]

    service_root = Path(__file__).resolve().parents[1]
    script = service_root / "scripts" / "release_checklist.sh"

    proc = subprocess.run(
        [
            "bash",
            str(script),
            "--no-tests",
            "--no-bundle",
            "--bundle-dir",
            bundle_dir,
            "--json",
        ],
        cwd=service_root,
        capture_output=True,
        text=True,
        check=True,
    )

    lines = proc.stdout.splitlines()
    json_start = next(i for i, line in enumerate(lines) if line.strip().startswith("{"))
    payload = json.loads("\n".join(lines[json_start:]))

    assert payload["ok"] is True
    assert payload["status"] == "pass"
    assert payload["bundle_dir"] == bundle_dir
    assert payload["archive"] is None
    assert payload["options"]["run_tests"] is False
    assert payload["options"]["build_bundle"] is False
    assert payload["options"]["pr_comment"] is None
    assert payload["options"]["dry_run"] is False
    assert payload["artifacts"]["verify_jsonl"] == "/tmp/ghostvm-ai-release-verify.jsonl"
