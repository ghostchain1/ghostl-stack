"""Aggregated telemetry collector for GACK.

Pulls metrics from:
  * Local psutil / /proc (CPU, memory, uptime)
  * GNMC REST API (/monitoring/health) — optional, graceful on failure
  * ghostdns-ai REST API (/health)     — optional, graceful on failure

All HTTP calls use stdlib urllib with strict timeouts.
No credentials or secrets are collected or logged.
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_GNMC_URL: str = os.getenv("GACK_GNMC_URL", "http://127.0.0.1:4060")
_GHOSTDNS_URL: str = os.getenv("GACK_GHOSTDNS_URL", os.getenv("GHOSTDNS_BASE_URL", "http://127.0.0.1:18089"))
_TIMEOUT_S: int = min(10, max(1, int(os.getenv("GACK_TELEMETRY_TIMEOUT_S", "5"))))


@dataclass
class TelemetrySnapshot:
    timestamp: float = field(default_factory=time.time)
    # Local host
    cpu_load_1m: float = 0.0
    memory_free_bytes: int = 0
    memory_total_bytes: int = 0
    uptime_seconds: float = 0.0
    hostname: str = ""
    # Upstream service statuses
    gnmc_ok: bool = False
    ghostdns_ok: bool = False
    # Chain healthiness (populated by kernel loop, not here)
    chains: dict = field(default_factory=dict)


def _fetch_json(url: str) -> dict:
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        logger.debug("Telemetry fetch failed for %s: %s", url, exc)
        return {}


def collect() -> TelemetrySnapshot:
    """Collect a full telemetry snapshot.  Never raises."""
    snap = TelemetrySnapshot()

    # ── Local system ──────────────────────────────────────────────────────
    try:
        import psutil
        vm = psutil.virtual_memory()
        snap.cpu_load_1m = psutil.getloadavg()[0] if hasattr(psutil, "getloadavg") else 0.0
        snap.memory_free_bytes = vm.available
        snap.memory_total_bytes = vm.total
        snap.uptime_seconds = time.time() - psutil.boot_time()
    except Exception:
        # /proc fallback
        try:
            with open("/proc/loadavg") as f:
                snap.cpu_load_1m = float(f.read().split()[0])
        except Exception:
            pass
        try:
            with open("/proc/meminfo") as f:
                lines = {}
                for line in f:
                    if ":" in line:
                        k, v = line.split(":", 1)
                        lines[k.strip()] = v.strip()
            snap.memory_free_bytes = int(lines.get("MemAvailable", "0 kB").split()[0]) * 1024
            snap.memory_total_bytes = int(lines.get("MemTotal", "0 kB").split()[0]) * 1024
        except Exception:
            pass
        try:
            with open("/proc/uptime") as f:
                snap.uptime_seconds = float(f.read().split()[0])
        except Exception:
            pass

    try:
        import platform
        snap.hostname = platform.node()
    except Exception:
        pass

    # ── Upstream services ─────────────────────────────────────────────────
    gnmc = _fetch_json(f"{_GNMC_URL}/health")
    snap.gnmc_ok = gnmc.get("status") == "ok"

    dns = _fetch_json(f"{_GHOSTDNS_URL}/health")
    snap.ghostdns_ok = isinstance(dns, dict) and len(dns) > 0

    return snap
