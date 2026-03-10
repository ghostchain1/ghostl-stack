"""Host system health metrics — psutil preferred, /proc fallback for containers."""
from __future__ import annotations

import logging
import os
import platform
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False
    logger.info("psutil not installed; falling back to /proc for system stats")


@dataclass
class SystemHealth:
    cpu_load_1m: float          # 1-minute load average
    memory_free_bytes: int      # available (not just free) memory
    memory_total_bytes: int
    uptime_seconds: float
    hostname: str


def get_system_health() -> SystemHealth:
    """Return current host health statistics.  Never raises — returns zero
    values for any metric that cannot be read."""
    hostname = platform.node()

    if _HAS_PSUTIL:
        try:
            vm = _psutil.virtual_memory()
            boot_time = _psutil.boot_time()
            load_avg = _psutil.getloadavg() if hasattr(_psutil, "getloadavg") else (0.0, 0.0, 0.0)
            return SystemHealth(
                cpu_load_1m=load_avg[0],
                memory_free_bytes=vm.available,
                memory_total_bytes=vm.total,
                uptime_seconds=time.time() - boot_time,
                hostname=hostname,
            )
        except Exception as exc:
            logger.warning("psutil error: %s", exc)

    # /proc fallback (Linux containers without psutil)
    cpu_1m = 0.0
    mem_free = 0
    mem_total = 0

    try:
        with open("/proc/loadavg") as f:
            cpu_1m = float(f.read().split()[0])
    except Exception:
        pass

    try:
        with open("/proc/meminfo") as f:
            lines: dict[str, str] = {}
            for line in f:
                if ":" in line:
                    k, v = line.split(":", 1)
                    lines[k.strip()] = v.strip()
            mem_free = int(lines.get("MemAvailable", "0 kB").split()[0]) * 1024
            mem_total = int(lines.get("MemTotal", "0 kB").split()[0]) * 1024
    except Exception:
        pass

    uptime = 0.0
    try:
        with open("/proc/uptime") as f:
            uptime = float(f.read().split()[0])
    except Exception:
        pass

    return SystemHealth(
        cpu_load_1m=cpu_1m,
        memory_free_bytes=mem_free,
        memory_total_bytes=mem_total,
        uptime_seconds=uptime,
        hostname=hostname,
    )
