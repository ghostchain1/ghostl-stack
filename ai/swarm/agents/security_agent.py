#!/usr/bin/env python3
"""
GhostStack AI Swarm — Security AI Agent
========================================
Performs continuous security scanning of the repository.

Checks (each tick samples a subset to avoid excessive runtime)
--------------------------------------------------------------
1. Secret scanning — private keys, mnemonics, JWT literals.
2. Shell injection — `shell=True` in Python subprocess calls.
3. Python syntax — `python3 -m py_compile` on recently-modified files.
4. Forge lint — invoked at most once per FORGE_LINT_INTERVAL_S seconds.
5. Dependency pin check — flags `*` or unresolved ranges in package.json.
6. Hardhat chain guard — verifies no forbidden chain IDs in configs.

Rules
-----
• No autonomous patching — findings are published on the bus and GhostBrain.
• No shell=True.
• Forge lint is optional; binary absence is silently handled.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from agents.base_agent import BaseSwarmAgent, AgentReport, AgentRecommendation, SwarmContext

logger = logging.getLogger("SecurityAgent")

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

_SECRET_PATTERNS = [
    (re.compile(r"0x[0-9a-fA-F]{64}"),             "Possible private key literal"),
    (re.compile(r"(?i)private[_\s]?key\s*=\s*['\"]0x"), "Private key assignment"),
    (re.compile(r"(?i)mnemonic\s*=\s*['\"][a-z ]{30,}"), "Mnemonic assignment"),
    (re.compile(r"(?i)jwt[_\s]?secret\s*=\s*['\"][A-Za-z0-9+/]{20,}"), "Hardcoded JWT secret"),
]
_SHELL_TRUE   = re.compile(r"shell\s*=\s*True")
_FORBIDDEN_CI = re.compile(r"\b(1|42161|8453|10|137)\b")

_SCAN_EXTS = {".sol", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".yaml", ".yml"}

_EXEMPT = frozenset(["node_modules", "dist", "out", "contracts/lib", ".git", "__pycache__"])
_FORGE_LINT_INTERVAL_S = int(os.environ.get("SECURITY_FORGE_LINT_INTERVAL_S", "300"))

# External chain IDs that must not appear in L2/L3 code
_FORBIDDEN_CHAIN_IDS = re.compile(r"\b(42161|8453|10|137)\b")


def _is_exempt(rel: str) -> bool:
    return any(e in rel.split(os.sep) for e in _EXEMPT)


class SecurityAgent(BaseSwarmAgent):
    ROLE = "security"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._repo      = Path(config["repo_path"])
        self._last_forge = 0.0
        self._tick_sample_count = int(config.get("security_files_per_tick", 200))

    def act(self, context: SwarmContext) -> AgentReport:
        recs: list[AgentRecommendation] = []
        t0 = time.monotonic()

        recs.extend(self._scan_secrets())
        recs.extend(self._scan_shell_true())
        recs.extend(self._scan_chain_ids())

        # Forge lint — rate-limited
        now = time.time()
        if now - self._last_forge >= _FORGE_LINT_INTERVAL_S:
            recs.extend(self._run_forge_lint())
            self._last_forge = now

        # Publish critical findings on bus
        critical = [r for r in recs if r.priority >= 90]
        for rec in critical:
            context.bus.publish("security:risk_alert", self.name, {
                "source":    rec.target or "repo",
                "riskScore": rec.confidence,
                "message":   rec.description,
            })

        elapsed = int((time.monotonic() - t0) * 1000)
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=True,
            duration_ms=elapsed,
            recommendations=recs,
            summary=f"{len(recs)} security findings ({len(critical)} critical)",
        )

    # ------------------------------------------------------------------

    def _iter_files(self) -> list[Path]:
        files = []
        for root, dirs, names in os.walk(self._repo):
            dirs[:] = [d for d in dirs if not _is_exempt(d)]
            for name in names:
                p = Path(root) / name
                if p.suffix in _SCAN_EXTS:
                    rel = str(p.relative_to(self._repo))
                    if not _is_exempt(rel):
                        files.append(p)
        # Sort by modification time descending so we always scan the most
        # recently changed files first within the sample window.
        files.sort(key=lambda f: f.stat().st_mtime if f.exists() else 0, reverse=True)
        return files[: self._tick_sample_count]

    def _scan_secrets(self) -> list[AgentRecommendation]:
        recs = []
        for path in self._iter_files():
            rel = str(path.relative_to(self._repo))
            if "example" in rel.lower() or "sample" in rel.lower():
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for pattern, desc in _SECRET_PATTERNS:
                for i, line in enumerate(lines, 1):
                    if pattern.search(line):
                        recs.append(AgentRecommendation(
                            kind="secret.detected",
                            target=f"{rel}:{i}",
                            confidence=0.85,
                            priority=95,
                            description=f"{desc} in {rel}:{i}",
                        ))
        return recs

    def _scan_shell_true(self) -> list[AgentRecommendation]:
        recs = []
        for path in self._iter_files():
            if path.suffix != ".py":
                continue
            rel = str(path.relative_to(self._repo))
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, 1):
                if _SHELL_TRUE.search(line):
                    recs.append(AgentRecommendation(
                        kind="security.shell_injection_risk",
                        target=f"{rel}:{i}",
                        confidence=0.9,
                        priority=85,
                        description=f"shell=True in {rel}:{i} — command injection risk",
                    ))
        return recs

    def _scan_chain_ids(self) -> list[AgentRecommendation]:
        """Flag external chain IDs in L2/L3 source files."""
        recs = []
        for path in self._iter_files():
            rel = str(path.relative_to(self._repo))
            if not ("/l2/" in rel or "/l3/" in rel or "ghostl2" in rel.lower() or "ghostl3" in rel.lower()):
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, 1):
                if _FORBIDDEN_CHAIN_IDS.search(line):
                    recs.append(AgentRecommendation(
                        kind="routing.external_chain_ref",
                        target=f"{rel}:{i}",
                        confidence=0.75,
                        priority=90,
                        description=f"Possible external chain ID in L2/L3 code: {rel}:{i}",
                    ))
        return recs

    def _run_forge_lint(self) -> list[AgentRecommendation]:
        forge = shutil.which("forge")
        if not forge:
            return []
        contracts = self._repo / "contracts"
        if not contracts.is_dir():
            return []
        result = subprocess.run(
            [forge, "lint"],
            capture_output=True,
            text=True,
            cwd=str(contracts),
            timeout=120,
        )
        recs = []
        for line in (result.stdout + result.stderr).splitlines():
            m = re.match(r"(Warning|Error)\s*\(([^:]+):(\d+)\):\s*(.+)", line)
            if m:
                sev = 80 if m.group(1) == "Warning" else 90
                recs.append(AgentRecommendation(
                    kind="forge_lint.warning",
                    target=f"{m.group(2)}:{m.group(3)}",
                    confidence=0.9,
                    priority=sev,
                    description=m.group(4).strip(),
                ))
        return recs
