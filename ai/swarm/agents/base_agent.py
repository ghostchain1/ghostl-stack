#!/usr/bin/env python3
"""
GhostStack AI Swarm — Base Agent Interface
==========================================
Every Python swarm agent inherits from BaseSwarmAgent and implements act().

Contract
--------
• act(context) is called once per swarm tick by SwarmController.
• It must return an AgentReport within AGENT_TIMEOUT_S seconds.
• It publishes domain-specific signals on the SwarmBus.
• It never writes on-chain or modifies files autonomously (advisory only).
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from communication.swarm_bus import SwarmBus


# ---------------------------------------------------------------------------
# Data model (mirrors TypeScript AgentReport + AgentRecommendation)
# ---------------------------------------------------------------------------


@dataclass
class AgentRecommendation:
    kind:        str            # unique action identifier
    target:      str = ""       # VM name, container, file, etc.
    confidence:  float = 1.0   # 0.0–1.0
    priority:    int   = 50    # higher = more urgent
    description: str  = ""


@dataclass
class AgentReport:
    agent_name:      str
    role:            str
    healthy:         bool
    duration_ms:     int
    recommendations: list[AgentRecommendation] = field(default_factory=list)
    summary:         str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "agentName":      self.agent_name,
            "role":           self.role,
            "healthy":        self.healthy,
            "durationMs":     self.duration_ms,
            "summary":        self.summary,
            "recommendations": [
                {
                    "kind":        r.kind,
                    "target":      r.target,
                    "confidence":  r.confidence,
                    "priority":    r.priority,
                    "description": r.description,
                }
                for r in self.recommendations
            ],
        }


@dataclass
class SwarmContext:
    """Injected into every agent on each tick."""
    bus:    SwarmBus
    tick:   int
    config: dict[str, Any]


# ---------------------------------------------------------------------------
# BaseSwarmAgent
# ---------------------------------------------------------------------------


class BaseSwarmAgent(ABC):
    """Abstract base for all Python swarm agents."""

    #: Subclasses must declare their role string.
    ROLE: str = "base"

    def __init__(self, config: dict[str, Any]) -> None:
        self._cfg = config

    @property
    def name(self) -> str:
        return self.__class__.__name__

    def run(self, context: SwarmContext) -> AgentReport:
        """
        Called by SwarmController.  Times the act() call and wraps exceptions
        so one failing agent never blocks others.
        """
        t0 = time.monotonic()
        try:
            report = self.act(context)
        except Exception as exc:  # noqa: BLE001
            elapsed = int((time.monotonic() - t0) * 1000)
            report = AgentReport(
                agent_name=self.name,
                role=self.ROLE,
                healthy=False,
                duration_ms=elapsed,
                summary=f"Unhandled exception: {exc}",
            )
        context.bus.broadcast_status(
            self.name,
            report.healthy,
            report.summary,
            report.duration_ms,
        )
        return report

    @abstractmethod
    def act(self, context: SwarmContext) -> AgentReport:
        """Perform one tick of agent-specific analysis.  Must not block."""
