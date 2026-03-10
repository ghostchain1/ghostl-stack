#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Patch Generator
=============================================================
Given a list of Findings, produces proposed patches.

Patch types
-----------
ADVISORY  — a JSON description submitted to the signing relay (human review).
            Used for governance-gated or risky changes.
DIFF      — a unified diff that TestEngine can apply and validate.
            Only generated for fixable, low-risk issues.

Every patch is advisory-first:
  • CRITICAL findings → governance proposal simulation only.
  • HIGH security     → advisory JSON; never auto-applied.
  • Branding/header   → DIFF generated; test gate applied before commit.

Rules
-----
• No shell=True.
• Max lines changed per patch enforced by config["max_patch_lines"].
• Patches for governance-gated contracts are never DIFF typed.
"""

from __future__ import annotations

import json
import logging
import re
import textwrap
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from code_analyzer import Finding

logger = logging.getLogger("PatchGenerator")

# ---------------------------------------------------------------------------
# Governance-gated file prefixes — DIFF patches never generated for these
# ---------------------------------------------------------------------------

_GOV_GATED = [
    "contracts/src/constitution/GhostConstitution.sol",
    "contracts/src/treasury/SovereignTreasuryEngine.sol",
    "contracts/src/governance/GhostChainGovernor.sol",
]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Patch:
    finding:      Finding
    patch_type:   str          # "diff" | "advisory" | "governance_proposal"
    description:  str
    diff:         str = ""     # unified diff (only for patch_type="diff")
    proposal:     dict[str, Any] = field(default_factory=dict)
    line_count:   int = 0


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


class PatchGenerator:

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg     = config
        self._repo    = Path(config["repo_path"])
        self._max_lines = int(config.get("max_patch_lines", 200))

    # ------------------------------------------------------------------
    def generate(self, findings: list[Finding]) -> list[Patch]:
        patches: list[Patch] = []
        for f in findings:
            patch = self._patch_for(f)
            if patch is not None:
                patches.append(patch)
        logger.info("Generated %d patches from %d findings", len(patches), len(findings))
        return patches

    # ------------------------------------------------------------------
    def _patch_for(self, f: Finding) -> Patch | None:
        # Governance-gated: always emit a proposal, never a diff
        if any(gated in f.file for gated in _GOV_GATED):
            return self._make_gov_proposal(f)

        # Critical: advisory only — never auto-apply
        if f.severity == "CRITICAL":
            return self._make_advisory(f)

        # Routing violations: advisory — need human architectural review
        if f.category == "routing":
            return self._make_advisory(f)

        # Security issues: high severity → advisory
        if f.category == "security" and f.severity in ("CRITICAL", "HIGH"):
            return self._make_advisory(f)

        # Forge lint, sol headers, branding → attempt diff if fixable or known pattern
        if f.category in ("branding", "sol_header"):
            diff = self._branding_diff(f)
            if diff:
                return Patch(
                    finding=f,
                    patch_type="diff",
                    description=f"Auto-fix branding issue: {f.message}",
                    diff=diff,
                    line_count=diff.count("\n+"),
                )

        # Everything else: advisory
        return self._make_advisory(f)

    # ------------------------------------------------------------------
    # Branding diff: add missing Solidity header
    # ------------------------------------------------------------------

    def _branding_diff(self, f: Finding) -> str:
        """Attempt a minimal diff for known branding issues."""
        abs_path = self._repo / f.file
        if not abs_path.is_file():
            return ""
        if f.message.startswith("Missing '// GhostChain Contracts"):
            try:
                original = abs_path.read_text(encoding="utf-8")
            except OSError:
                return ""
            expected_header = f"// GhostChain Contracts v5.6.1 ({f.file})"
            if expected_header in original:
                return ""
            patched = expected_header + "\n" + original
            diff_lines = list(_unified_diff(original, patched, f.file))
            if len(diff_lines) > self._max_lines:
                return ""
            return "\n".join(diff_lines)
        return ""

    # ------------------------------------------------------------------
    # Advisory patch
    # ------------------------------------------------------------------

    def _make_advisory(self, f: Finding) -> Patch:
        return Patch(
            finding=f,
            patch_type="advisory",
            description=f"[{f.severity}] {f.category}: {f.message}",
            proposal={
                "type":          "advisory_patch",
                "severity":      f.severity,
                "category":      f.category,
                "file":          f.file,
                "line":          f.line,
                "message":       f.message,
                "tool":          f.tool,
                "simulation_only": True,
                "requires_human_review": True,
            },
        )

    # ------------------------------------------------------------------
    # Governance proposal
    # ------------------------------------------------------------------

    def _make_gov_proposal(self, f: Finding) -> Patch:
        return Patch(
            finding=f,
            patch_type="governance_proposal",
            description=f"Governance proposal required for: {f.file}:{f.line}",
            proposal={
                "type":            "governance_proposal",
                "chain_id":        14000101,
                "gas_token":       "GST",
                "title":           f"[AI] {f.category} in {f.file}",
                "change":          f.message,
                "rationale":       (
                    "Flagged by GhostStack AI Engineering Agent. "
                    "Human review and governance quorum required."
                ),
                "requires_quorum": True,
                "simulation_only": True,
                "created_at":      int(time.time()),
            },
        )


# ---------------------------------------------------------------------------
# Minimal unified diff helper (no external library needed)
# ---------------------------------------------------------------------------

def _unified_diff(
    original: str, patched: str, filename: str
) -> list[str]:
    import difflib
    a = original.splitlines(keepends=True)
    b = patched.splitlines(keepends=True)
    return list(difflib.unified_diff(a, b, fromfile=f"a/{filename}", tofile=f"b/{filename}"))
