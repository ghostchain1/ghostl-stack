#!/usr/bin/env python3
"""
GhostStack AI Swarm — Engineering AI Agent (swarm adapter)
===========================================================
Thin adapter that delegates to the autonomous engineering agent's scanner and
analyzer, then translates findings into swarm recommendations.

This agent does NOT run a full engineering cycle each tick (that would be too
expensive).  Instead it:
  1. Runs the RepoScanner on a lightweight sample (recently-modified files).
  2. Passes the sample to CodeAnalyzer.
  3. Converts HIGH+ findings to swarm recommendations.
  4. Publishes on bus and GhostBrain via the swarm signal path.

Full-depth engineering cycles are managed by the standalone
`ai/engineering-agent/agent.py` process (separate service).
"""

from __future__ import annotations

import logging
import sys
import time
from pathlib import Path
from typing import Any

from agents.base_agent import BaseSwarmAgent, AgentReport, AgentRecommendation, SwarmContext

logger = logging.getLogger("EngineeringAgent")

# Add the engineering-agent directory to sys.path so we can reuse its modules.
_ENG_PATH = str(Path(__file__).resolve().parent.parent.parent / "engineering-agent")
if _ENG_PATH not in sys.path:
    sys.path.insert(0, _ENG_PATH)


class EngineeringAgent(BaseSwarmAgent):
    ROLE = "engineering"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        # Import lazily so missing deps don't break the whole swarm at startup.
        self._scanner  = None
        self._analyzer = None
        self._config   = config
        self._load_modules()

    def _load_modules(self) -> None:
        try:
            from repo_scanner   import RepoScanner    # type: ignore
            from code_analyzer  import CodeAnalyzer   # type: ignore
            self._scanner  = RepoScanner(self._config)
            self._analyzer = CodeAnalyzer(self._config)
            logger.info("EngineeringAgent: loaded scanner and analyzer from %s", _ENG_PATH)
        except ImportError as exc:
            logger.warning("EngineeringAgent: could not import scanner/analyzer: %s", exc)

    def act(self, context: SwarmContext) -> AgentReport:
        t0   = time.monotonic()
        recs: list[AgentRecommendation] = []

        if self._scanner is None or self._analyzer is None:
            elapsed = int((time.monotonic() - t0) * 1000)
            return AgentReport(
                agent_name=self.name,
                role=self.ROLE,
                healthy=False,
                duration_ms=elapsed,
                summary="Scanner/analyzer unavailable — check sys.path",
            )

        try:
            manifest  = self._scanner.scan()
            findings  = self._analyzer.analyze(manifest)
        except Exception as exc:  # noqa: BLE001
            elapsed = int((time.monotonic() - t0) * 1000)
            return AgentReport(
                agent_name=self.name,
                role=self.ROLE,
                healthy=False,
                duration_ms=elapsed,
                summary=f"Scan error: {exc}",
            )

        for f in findings:
            if f.severity not in ("CRITICAL", "HIGH"):
                continue
            priority = 95 if f.severity == "CRITICAL" else 80
            recs.append(AgentRecommendation(
                kind=f"eng.{f.category}",
                target=f"{f.file}:{f.line}",
                confidence=0.85,
                priority=priority,
                description=f"[{f.severity}] {f.message}",
            ))
            if f.severity == "CRITICAL":
                context.bus.publish("security:risk_alert", self.name, {
                    "source":    f.file,
                    "riskScore": 0.9,
                    "message":   f.message,
                })

        by_sev: dict[str, int] = {}
        for f in findings:
            by_sev[f.severity] = by_sev.get(f.severity, 0) + 1

        elapsed = int((time.monotonic() - t0) * 1000)
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=True,
            duration_ms=elapsed,
            recommendations=recs,
            summary=(
                f"scanned={manifest.file_count} "
                f"findings={len(findings)} "
                f"by_sev={by_sev}"
            ),
        )
