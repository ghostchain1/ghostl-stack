from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def plan_hash(plan: dict[str, Any]) -> str:
    blob = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def check_approval(approvals_dir: Path, action_id: str, expected_plan_hash: str) -> tuple[bool, str]:
    approval_file = approvals_dir / f"{action_id}.json"
    if not approval_file.exists():
        return False, f"missing_approval_file:{approval_file}"
    try:
        data = json.loads(approval_file.read_text(encoding="utf-8"))
    except Exception as exc:
        return False, f"invalid_approval_json:{exc}"

    if data.get("plan_hash") != expected_plan_hash:
        return False, "approval_plan_hash_mismatch"
    signatures = data.get("signatures") or []
    if not signatures:
        return False, "approval_missing_signatures"
    return True, "ok"
