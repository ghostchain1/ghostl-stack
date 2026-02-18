from __future__ import annotations

from dataclasses import dataclass


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
    # Propose conservative, diff-only candidates. No auto-apply in this module.
    if kind == "gst_leakage_gate":
        return [
            CandidateSpec(
                patch_type="p1_scoped_identifier_rename",
                rationale="Apply a scoped identifier rename in first-party files only while preserving protocol compatibility namespaces.",
                risk="medium (rename surface); requires full verification gates",
                rollback="git revert <commit_sha>",
                files=[],
                files_touched=4,
                lines_changed=110,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="p2_env_compat_shim",
                rationale="Introduce temporary configuration aliasing to preserve service startup during naming migration.",
                risk="low-medium (compatibility layer drift)",
                rollback="git revert <commit_sha>",
                files=["services/**/config.*", "packages/config/**"],
                files_touched=3,
                lines_changed=70,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="p3_db_expand_backfill_switch",
                rationale="Use an expand/backfill/switch migration sequence for renamed accounting fields.",
                risk="medium (migration sequencing)",
                rollback="git revert <commit_sha>",
                files=["services/**/migrations/**"],
                files_touched=4,
                lines_changed=140,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="p4_ui_label_correction",
                rationale="Correct user-facing labels and docs to canonical native-currency naming.",
                risk="low",
                rollback="git revert <commit_sha>",
                files=["apps/**", "docs/**"],
                files_touched=1,
                lines_changed=40,
                rollback_simple=True,
                verification_coverage=3,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="p5_metrics_dashboard_alignment",
                rationale="Align metric names and dashboard legends with canonical fee and supply naming.",
                risk="low-medium (query drift)",
                rollback="git revert <commit_sha>",
                files=["observability/**", "grafana/**", "prometheus/**"],
                files_touched=3,
                lines_changed=85,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="tighten_allowlist",
                rationale="Reduce allowlist scope and keep only justified technical exceptions.",
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

    if kind == "gst_symbol_gate":
        return [
            CandidateSpec(
                patch_type="p4_ui_label_correction",
                rationale="Replace incorrect symbol usage in user-facing surfaces and metadata.",
                risk="low",
                rollback="git revert <commit_sha>",
                files=["apps/**", "docs/**", "packages/config/**"],
                files_touched=2,
                lines_changed=32,
                rollback_simple=True,
                verification_coverage=3,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            )
        ]

    if kind == "rpc_down":
        return [
            CandidateSpec(
                patch_type="p6_opstack_config_alignment",
                rationale="Align node and service endpoint wiring with expected chain topology and compatibility shims.",
                risk="medium (runtime endpoint changes)",
                rollback="git revert <commit_sha>",
                files=["infra/opstack/**", "docker-compose*.yml", "services/**/.env*"],
                files_touched=4,
                lines_changed=120,
                rollback_simple=True,
                verification_coverage=4,
                touches_stateful_chain=False,
                changes_volumes=False,
                changes_rpc_endpoints_without_shim=False,
                violates_policy=False,
            ),
            CandidateSpec(
                patch_type="triage_only",
                rationale="Collect logs and validate runtime configuration before proposing a diff.",
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
            ),
        ]

    if kind in ("docker_health", "docker_ps_failed"):
        return [
            CandidateSpec(
                patch_type="triage_only",
                rationale="Collect container logs and health output before proposing a runtime diff.",
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
