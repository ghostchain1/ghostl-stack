from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    evidence_dir = root / "evidence"
    summaries = sorted([p for p in evidence_dir.iterdir() if p.is_dir()]) if evidence_dir.exists() else []
    if not summaries:
        print("No evidence found")
        return

    latest = summaries[-1]
    payload = json.loads((latest / "network-verification.json").read_text(encoding="utf-8"))
    lines = [
        f"# Network Verification Summary {payload.get('timestamp')}",
        "",
        f"- Overall: {'PASS' if payload.get('ok') else 'FAIL'}",
        "",
        "## Checks",
    ]
    for check in payload.get("checks", []):
        lines.append(f"- {'✅' if check.get('ok') else '❌'} {check.get('name')}: {check.get('details')}")

    out = latest / "network-verification.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
