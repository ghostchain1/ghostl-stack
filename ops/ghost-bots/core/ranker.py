from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PatchCandidate:
    patch_type: str
    files_touched: int
    lines_changed: int
    rollback_simple: bool
    verification_coverage: int
    touches_stateful_chain: bool
    changes_volumes: bool
    changes_rpc_endpoints_without_shim: bool
    violates_policy: bool


def score(candidate: PatchCandidate) -> int:
    s = 0

    if candidate.files_touched < 5:
        s += 40
    if candidate.lines_changed < 120:
        s += 25
    if candidate.rollback_simple:
        s += 20
    if candidate.verification_coverage >= 3:
        s += 20

    if candidate.touches_stateful_chain:
        s -= 40
    if candidate.changes_volumes:
        s -= 25
    if candidate.changes_rpc_endpoints_without_shim:
        s -= 20
    if candidate.violates_policy:
        s -= 50

    return s
