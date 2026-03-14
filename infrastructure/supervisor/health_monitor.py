"""
Health Monitor — system and infrastructure health metrics.

Collects CPU, memory, disk, and load average via psutil.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import psutil  # type: ignore[import-untyped]
    _PSUTIL_AVAILABLE = True
except ImportError:
    _PSUTIL_AVAILABLE = False
    logger.warning("psutil not installed — HealthMonitor running in stub mode.")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

@dataclass
class SystemMetrics:
    cpu_percent:      float  = 0.0
    memory_percent:   float  = 0.0
    memory_total_gb:  float  = 0.0
    memory_free_gb:   float  = 0.0
    disk_percent:     float  = 0.0
    load_1m:          float  = 0.0
    load_5m:          float  = 0.0
    load_15m:         float  = 0.0
    cpu_count:        int    = 0
    errors:           list[str] = field(default_factory=list)

    @property
    def healthy(self) -> bool:
        return (
            self.cpu_percent    < 95.0 and
            self.memory_percent < 95.0 and
            self.disk_percent   < 95.0 and
            len(self.errors)    == 0
        )


# ---------------------------------------------------------------------------
# HealthMonitor
# ---------------------------------------------------------------------------

class HealthMonitor:
    """Collects system health metrics."""

    CPU_WARN_THRESHOLD    = 85.0
    MEMORY_WARN_THRESHOLD = 85.0
    DISK_WARN_THRESHOLD   = 80.0
    DISK_PATH             = "/"

    def system_metrics(self) -> SystemMetrics:
        """Sample current system metrics."""
        if not _PSUTIL_AVAILABLE:
            return SystemMetrics(errors=["psutil not available"])

        errors: list[str] = []
        metrics = SystemMetrics()

        try:
            metrics.cpu_percent  = psutil.cpu_percent(interval=1)
            metrics.cpu_count    = psutil.cpu_count(logical=True) or 0
        except Exception as exc:
            errors.append(f"cpu: {exc}")

        try:
            vm = psutil.virtual_memory()
            metrics.memory_percent = vm.percent
            metrics.memory_total_gb = vm.total / (1024 ** 3)
            metrics.memory_free_gb  = vm.available / (1024 ** 3)
        except Exception as exc:
            errors.append(f"memory: {exc}")

        try:
            disk = psutil.disk_usage(self.DISK_PATH)
            metrics.disk_percent = disk.percent
        except Exception as exc:
            errors.append(f"disk: {exc}")

        try:
            load = psutil.getloadavg()
            metrics.load_1m  = load[0]
            metrics.load_5m  = load[1]
            metrics.load_15m = load[2]
        except Exception as exc:
            errors.append(f"load: {exc}")

        metrics.errors = errors

        if metrics.cpu_percent > self.CPU_WARN_THRESHOLD:
            logger.warning("High CPU: %.1f%%", metrics.cpu_percent)
        if metrics.memory_percent > self.MEMORY_WARN_THRESHOLD:
            logger.warning("High memory: %.1f%%", metrics.memory_percent)
        if metrics.disk_percent > self.DISK_WARN_THRESHOLD:
            logger.warning("High disk: %.1f%%", metrics.disk_percent)

        return metrics
