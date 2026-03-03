"""
ghostbrain_client — embedded GhostBrain Core HTTP client (Python).

Registers this agent and sends periodic health heartbeats to GhostBrain Core.
Self-contained; uses only stdlib (urllib.request + threading).

Env vars:
    GHOSTBRAIN_URL      Base URL (default: http://ghostbrain-core:7900)
    GHOSTBRAIN_ENABLED  "false"/"0" to disable (default: true)
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.request
import urllib.error
from typing import Any

logger = logging.getLogger(__name__)

_GHOSTBRAIN_URL    = os.getenv("GHOSTBRAIN_URL", "http://ghostbrain-core:7900").rstrip("/")
_GHOSTBRAIN_ENABLED = os.getenv("GHOSTBRAIN_ENABLED", "true").lower() not in ("false", "0", "no")

AGENT_ID    = "ghost-storage-ai"
AGENT_ROLE  = "executor"
AGENT_LAYER = "L1"

_REGISTER_BODY = json.dumps({
    "agentId":      AGENT_ID,
    "role":         AGENT_ROLE,
    "capabilities": ["db.backup.verify", "db.replication.status", "db.migration.apply", "libvirt.status"],
    "resourceScopes": [
        {"type": "db",    "name": "*", "layer": "L1"},
        {"type": "vm",    "name": "*", "layer": "L1"},
        {"type": "stack", "name": "ghost-storage-ai", "layer": "L1"},
    ],
    "natsSubject": f"ghostbrain.agent.{AGENT_ID}.task",
    "healthy": True,
}).encode()


def _post(path: str, body: bytes, timeout: float = 5.0) -> bool:
    url = f"{_GHOSTBRAIN_URL}{path}"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError):
        return False


def ghostbrain_register(retries: int = 5, delay_s: float = 3.0) -> None:
    """Register this agent with GhostBrain Core. Retries on failure. Non-fatal."""
    if not _GHOSTBRAIN_ENABLED:
        return
    for attempt in range(1, retries + 1):
        ok = _post("/api/v1/agents/register", _REGISTER_BODY)
        if ok:
            logger.info("[ghostbrain] Registered with GhostBrain Core role=%s url=%s", AGENT_ROLE, _GHOSTBRAIN_URL)
            return
        logger.warning("[ghostbrain] registration attempt %d/%d failed", attempt, retries)
        if attempt < retries:
            time.sleep(delay_s)
    logger.error("[ghostbrain] registration failed — running standalone")


def _heartbeat_loop(interval_s: float) -> None:
    body = json.dumps({
        "source": "manual",
        "service": AGENT_ID,
        "layer": AGENT_LAYER,
        "anomaly": False,
    }).encode()
    while True:
        time.sleep(interval_s)
        _post("/api/v1/signals", body, timeout=3.0)


def ghostbrain_start_heartbeat(interval_s: float = 30.0) -> None:
    """Start a background daemon thread that pings GhostBrain every `interval_s` seconds."""
    if not _GHOSTBRAIN_ENABLED:
        return
    t = threading.Thread(target=_heartbeat_loop, args=(interval_s,), daemon=True)
    t.start()
    logger.info("[ghostbrain] heartbeat started interval=%.0fs", interval_s)


def ghostbrain_anomaly(metric: str, value: float, threshold: float, extra: dict[str, Any] | None = None) -> None:
    """Send an anomaly signal to GhostBrain (triggers incident assessment). Non-fatal."""
    if not _GHOSTBRAIN_ENABLED:
        return
    body = json.dumps({
        "source":     "manual",
        "service":    AGENT_ID,
        "layer":      AGENT_LAYER,
        "anomaly":    True,
        "metric":     metric,
        "value":      value,
        "threshold":  threshold,
        **(extra or {}),
    }).encode()
    _post("/api/v1/signals", body, timeout=3.0)
