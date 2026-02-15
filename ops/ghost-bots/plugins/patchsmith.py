from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CandidateSpec:
    patch_type: str
    rationale: str
    risk: str
    rollback: str
    files: list[str]
    # Heuristics for ranking (no patch application in this skeleton).
    files_touched: int
    lines_changed: int
    rollback_simple: bool
    verification_coverage: int
    touches_stateful_chain: bool
    changes_volumes: bool
    changes_rpc_endpoints_without_shim: bool
    violates_policy: bool


def candidates_for_incident(kind: str) -> list[CandidateSpec]:
    # Keep this conservative: propose patches, do not apply automatically.
    if kind == "gst_leakage_gate":
        return [
            CandidateSpec(
                patch_type="fix_gst_leakage",
                rationale="Remove forbidden native-currency branding tokens and legacy identifier leakage from first-party code/config/docs.",
                risk="medium (broad rename risk); must be validated by gst gate + tests",
                rollback="git revert <commit_sha>",
                files=[],
                files_touched=5,
                lines_changed=80,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="tighten_allowlist",
                rationale="Reduce allowlist scope; document justified technical exceptions only.",
                risk="low",
                rollback="git revert <commit_sha>",
                files=["config/gst-allowlist.txt"],
                files_touched=1,
                lines_changed=20,
                rollback_simple=True,
                verification_coverage=2,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
        ]

    if kind in ("rpc_down", "docker_health"):
        return [
            CandidateSpec(
                patch_type="triage_only",
                rationale="Collect logs and validate runtime configuration; do not patch until root cause is known.",
                risk="low",
                rollback="n/a",
                files=[],
                files_touched=0,
                lines_changed=0,
                rollback_simple=True,
                verification_coverage=1,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            )
        ]

    return []
