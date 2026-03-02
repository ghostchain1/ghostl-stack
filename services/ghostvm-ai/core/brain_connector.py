"""
GhostBrain Connector — ghostvm-ai
----------------------------------
Registers ghostvm-ai as a GhostBrain Core agent and publishes health/anomaly
signals via the GhostBrain HTTP API (POST /api/v1/signals,
POST /api/v1/agents/register).

Uses only Python stdlib (urllib, uuid, threading) — no additional deps.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
import urllib.request
from typing import Any

logger = logging.getLogger("ghostvm-ai.brain_connector")

GHOSTBRAIN_URL     = os.getenv("GHOSTBRAIN_URL", "http://ghostbrain-core:7900")
GHOSTBRAIN_ENABLED = os.getenv("GHOSTBRAIN_ENABLED", "true").lower() == "true"
AGENT_ID           = "ghostvm-ai"
HEARTBEAT_INTERVAL = int(os.getenv("GHOSTBRAIN_HEARTBEAT_SECONDS", "60"))

# Layer inferred from VM name patterns published in signals
_LAYER_MAP = {"l3": "L3", "l2": "L2", "l1": "L1"}


def _infer_layer(service: str) -> str:
    lower = service.lower()
    for key, layer in _LAYER_MAP.items():
        if key in lower:
            return layer
    return "L2"


def _post(path: str, data: dict[str, Any]) -> None:
    """Fire-and-forget POST; errors logged but never raised."""
    if not GHOSTBRAIN_ENABLED:
        return
    try:
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            f"{GHOSTBRAIN_URL}{path}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            _ = resp.read()
    except Exception as exc:
        logger.debug("GhostBrain POST %s failed: %s", path, exc)


def register() -> None:
    """Register ghostvm-ai as a GhostBrain agent (call on startup)."""
    _post("/api/v1/agents/register", {
        "agentId": AGENT_ID,
        "role": "executor",
        "capabilities": [
            "libvirt.status",
            "libvirt.start",
            "libvirt.stop",
            "libvirt.snapshot",
            "network.firewall.read",
            "network.dns.update",
            "db.backup.verify",
        ],
        "resourceScopes": [
            {"type": "vm",      "name": "ghostl3-*",  "layer": "L3"},
            {"type": "vm",      "name": "ghostl2-*",  "layer": "L2"},
            {"type": "vm",      "name": "ghostchain-*", "layer": "L1"},
            {"type": "network", "name": "ghoststack-*", "layer": "L2"},
        ],
        "healthy": True,
    })
    logger.info("Registered with GhostBrain Core at %s", GHOSTBRAIN_URL)


def publish_signal(
    *,
    service: str,
    metric: str,
    value: float,
    anomaly: bool,
    log_line: str = "",
    layer: str | None = None,
    source: str = "manual",
) -> None:
    """Publish a health or anomaly signal to GhostBrain Core."""
    _post("/api/v1/signals", {
        "signalId": str(uuid.uuid4()),
        "source": source,
        "service": service,
        "layer": layer or _infer_layer(service),
        "metric": metric,
        "value": value,
        "threshold": 1.0,
        "logLine": log_line,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "anomaly": anomaly,
    })


def _heartbeat_loop() -> None:
    while True:
        try:
            publish_signal(
                service=AGENT_ID,
                metric="agent.alive",
                value=1.0,
                anomaly=False,
                layer="L2",
                log_line="ghostvm-ai heartbeat",
            )
        except Exception as exc:
            logger.debug("Heartbeat error: %s", exc)
        time.sleep(HEARTBEAT_INTERVAL)


def start() -> None:
    """Start the brain connector: register + heartbeat thread."""
    if not GHOSTBRAIN_ENABLED:
        logger.info("GhostBrain connector disabled (GHOSTBRAIN_ENABLED=false)")
        return
    threading.Thread(target=register, daemon=True).start()
    threading.Thread(target=_heartbeat_loop, daemon=True, name="ghostbrain-heartbeat").start()
    logger.info("GhostBrain connector started (url=%s)", GHOSTBRAIN_URL)
