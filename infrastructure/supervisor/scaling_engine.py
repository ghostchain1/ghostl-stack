"""
Scaling Engine — evaluates infrastructure metrics and recommends scale actions.

This engine only SIGNALS — it does NOT spawn VMs or containers autonomously.
Any scale-up action requires human ratification via the governance signing relay.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class ScaleAction(Enum):
    NONE        = "none"
    SCALE_UP    = "scale_up"
    SCALE_DOWN  = "scale_down"
    ALERT       = "alert"


@dataclass
class ScaleSignal:
    action:   ScaleAction
    reason:   str
    urgency:  str  # "low" | "medium" | "high"


class ScalingEngine:
    """Evaluates system metrics and recommends scaling actions."""

    CPU_SCALE_UP_THRESHOLD    = 85.0
    CPU_SCALE_UP_CRITICAL     = 95.0
    MEMORY_SCALE_UP_THRESHOLD = 88.0
    CPU_SCALE_DOWN_THRESHOLD  = 20.0
    MEMORY_SCALE_DOWN_THRESHOLD = 25.0

    def check(self, metrics: dict) -> Optional[ScaleSignal]:
        """
        Evaluate a metrics dict and return a ScaleSignal if action recommended.

        Metrics dict expected keys:
          cpu (float 0–100), memory (float 0–100)
        """
        cpu = float(metrics.get("cpu", 0))
        mem = float(metrics.get("memory", 0))

        if cpu >= self.CPU_SCALE_UP_CRITICAL or mem >= 95.0:
            logger.error("CRITICAL resource pressure — scale_up urgent: cpu=%.1f%% mem=%.1f%%", cpu, mem)
            return ScaleSignal(
                action=ScaleAction.ALERT,
                reason=f"Critical: CPU={cpu:.1f}% MEM={mem:.1f}%",
                urgency="high",
            )

        if cpu >= self.CPU_SCALE_UP_THRESHOLD or mem >= self.MEMORY_SCALE_UP_THRESHOLD:
            logger.warning("High load — scale_up recommended: cpu=%.1f%% mem=%.1f%%", cpu, mem)
            return ScaleSignal(
                action=ScaleAction.SCALE_UP,
                reason=f"High load: CPU={cpu:.1f}% MEM={mem:.1f}%",
                urgency="medium",
            )

        if cpu <= self.CPU_SCALE_DOWN_THRESHOLD and mem <= self.MEMORY_SCALE_DOWN_THRESHOLD:
            return ScaleSignal(
                action=ScaleAction.SCALE_DOWN,
                reason=f"Low utilisation: CPU={cpu:.1f}% MEM={mem:.1f}%",
                urgency="low",
            )

        return None  # No action needed.
