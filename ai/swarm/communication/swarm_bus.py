#!/usr/bin/env python3
"""
GhostStack AI Swarm — In-Process Message Bus + GhostBrain Bridge
=================================================================
Provides typed pub/sub for Python-side swarm agents, and bridges outbound
signals to GhostBrain Core (port 7900) so the TypeScript swarm can read them.

Design
------
• In-process: handlers are called synchronously in publish() order —
  no race conditions between agents on the same tick.
• Thread-safe: RLock guards subscriber maps so agents on different threads
  can subscribe/unsubscribe safely.
• GhostBrain bridge: every publish() also POSTs the signal asynchronously
  to GhostBrain /api/v1/signals (failures are silently dropped — the bus
  never blocks on GhostBrain availability).

Topics (mirrors ghost-brain-core/swarm/messaging/event_channel.ts)
-------------------------------------------------------------------
  agent:status         — agent health heartbeat each tick
  infra:node_alert     — VM / container in trouble
  infra:repair_result  — outcome of an advisory repair request
  security:risk_alert  — risk score above threshold
  network:degraded     — chain RPC degraded
  chain:block_alert    — missed blocks or chain halt
  econ:signal          — economic / treasury signal
  governance:propose   — advisory governance proposal
  consensus:actions    — aggregated consensus output (published by controller)

Rules
-----
• No shell=True.
• All GhostBrain POSTs include chain_id=14000101 and gas_token="GST".
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger("SwarmBus")

# ---------------------------------------------------------------------------
# Canonical topics
# ---------------------------------------------------------------------------

TOPICS = frozenset([
    "agent:status",
    "infra:node_alert",
    "infra:repair_result",
    "security:risk_alert",
    "network:degraded",
    "chain:block_alert",
    "econ:signal",
    "governance:propose",
    "consensus:actions",
])

# ---------------------------------------------------------------------------
# Message envelope
# ---------------------------------------------------------------------------


@dataclass
class SwarmMessage:
    topic:     str
    from_agent: str
    payload:   dict[str, Any]
    timestamp: float = field(default_factory=time.time)


Handler = Callable[[SwarmMessage], None]


# ---------------------------------------------------------------------------
# SwarmBus
# ---------------------------------------------------------------------------


class SwarmBus:
    """
    Type-safe in-process pub/sub bus that mirrors the TypeScript AgentBus.
    Optionally bridges signals to GhostBrain Core.
    """

    def __init__(
        self,
        ghostbrain_url: str = "http://localhost:7900",
        bridge_enabled: bool = True,
    ) -> None:
        self._ghostbrain_url = ghostbrain_url
        self._bridge_enabled = bridge_enabled
        self._lock: threading.RLock = threading.RLock()
        self._subscribers: dict[str, list[Handler]] = {}

    # ------------------------------------------------------------------
    # Pub/sub
    # ------------------------------------------------------------------

    def subscribe(self, topic: str, handler: Handler) -> Callable[[], None]:
        """
        Register a handler for a topic.
        Returns an unsubscribe callable.
        """
        with self._lock:
            self._subscribers.setdefault(topic, []).append(handler)
        def unsub() -> None:
            with self._lock:
                try:
                    self._subscribers[topic].remove(handler)
                except (KeyError, ValueError):
                    pass
        return unsub

    def publish(
        self,
        topic:      str,
        from_agent: str,
        payload:    dict[str, Any],
    ) -> int:
        """
        Publish a message on a topic.  Called synchronously — all handlers
        execute before publish() returns.  Returns subscriber count.
        """
        if topic not in TOPICS:
            logger.debug("Unknown topic: %s", topic)
        msg = SwarmMessage(topic=topic, from_agent=from_agent, payload=payload)
        with self._lock:
            handlers = list(self._subscribers.get(topic, []))
        for h in handlers:
            try:
                h(msg)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Handler error on topic %s: %s", topic, exc)

        if self._bridge_enabled:
            self._bridge_to_ghostbrain(msg)

        return len(handlers)

    # ------------------------------------------------------------------
    # GhostBrain bridge
    # ------------------------------------------------------------------

    def _bridge_to_ghostbrain(self, msg: SwarmMessage) -> None:
        """POST the message to GhostBrain /api/v1/signals (fire-and-forget)."""
        t = threading.Thread(target=self._post_signal, args=(msg,), daemon=True)
        t.start()

    def _post_signal(self, msg: SwarmMessage) -> None:
        payload = {
            "agent":      msg.from_agent,
            "event_type": f"swarm.{msg.topic.replace(':', '.')}",
            "timestamp":  int(msg.timestamp),
            "chain_id":   14000101,
            "gas_token":  "GST",
            "data": {
                "topic":   msg.topic,
                "payload": msg.payload,
            },
        }
        body = json.dumps(payload).encode("utf-8")
        url  = f"{self._ghostbrain_url}/api/v1/signals"
        req  = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=4):
                pass
        except urllib.error.URLError:
            pass  # GhostBrain unreachable — drop silently

    # ------------------------------------------------------------------
    # Convenience helpers for controller
    # ------------------------------------------------------------------

    def broadcast_status(
        self,
        agent_name: str,
        healthy:    bool,
        message:    str = "",
        duration_ms: int = 0,
    ) -> None:
        self.publish("agent:status", agent_name, {
            "agentName":  agent_name,
            "healthy":    healthy,
            "message":    message,
            "durationMs": duration_ms,
        })
