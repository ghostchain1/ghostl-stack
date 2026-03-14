#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — GhostBrain Memory
===============================================================
Bidirectional interface with GhostBrain Core (port 7900).

Responsibilities
----------------
• Push engineering-agent signals (scan results, patch summaries, health) to
  GhostBrain via POST /api/v1/signals.
• Pull AI directives from GhostBrain via GET /api/v1/directives (agent-scoped).
• Maintain a local ring-buffer of the last N events for offline resilience.

Rules
-----
• No shell=True.
• GhostBrain is consulted read-only for risk augmentation; it never writes
  on-chain directly through this module.
• If GhostBrain is unreachable, signals are spooled locally and replayed on
  next successful connection.
"""

from __future__ import annotations

import collections
import json
import logging
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger("GhostBrainMemory")

_MAX_SPOOL = 100     # local ring-buffer size
_SPOOL_DIR_VAR = "GAIS_SPOOL_DIR"


class GhostBrainMemory:

    def __init__(self, config: dict[str, Any]) -> None:
        self._url         = config.get("ghostbrain_url", "http://localhost:7900")
        self._agent_id    = "ai-engineering-agent"
        self._timeout     = 6
        self._spool:      collections.deque[dict[str, Any]] = collections.deque(
            maxlen=_MAX_SPOOL
        )
        self._spool_dir   = Path(
            os.environ.get(_SPOOL_DIR_VAR, "/home/ghost/ghostl-stack/logs/ghostbrain-spool")
        )

    # ------------------------------------------------------------------
    # Ingest
    # ------------------------------------------------------------------

    def store(self, event: dict[str, Any]) -> None:
        """Store an event in GhostBrain memory.  Falls back to local spool."""
        payload = {
            "agent":      self._agent_id,
            "event_type": event.get("type", "engineering.event"),
            "timestamp":  int(time.time()),
            "chain_id":   14000101,
            "gas_token":  "GST",
            "data":       event,
        }
        if not self._push_signal(payload):
            self._spool.append(payload)
            logger.debug("Signal spooled locally (GhostBrain unreachable)")

    # ------------------------------------------------------------------
    # Convenience wrappers
    # ------------------------------------------------------------------

    def report_scan(self, manifest_summary: dict[str, Any]) -> None:
        self.store({
            "type":    "engineering.scan_complete",
            "summary": manifest_summary,
        })

    def report_findings(self, finding_count: int, by_severity: dict[str, int]) -> None:
        self.store({
            "type":          "engineering.analysis_complete",
            "finding_count": finding_count,
            "by_severity":   by_severity,
        })

    def report_deploy(self, deploy_result: dict[str, int]) -> None:
        self.store({
            "type":   "engineering.deploy_complete",
            "result": deploy_result,
        })

    def report_infra(self, infra_summary: dict[str, Any]) -> None:
        self.store({
            "type":    "engineering.infra_heartbeat",
            "summary": infra_summary,
        })

    # ------------------------------------------------------------------
    # Directives (pull from GhostBrain)
    # ------------------------------------------------------------------

    def pull_directives(self) -> list[dict[str, Any]]:
        """
        Fetch pending directives from GhostBrain for this agent.
        Returns empty list if unreachable.
        """
        url = f"{self._url}/api/v1/directives?agent={self._agent_id}"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                directives = data if isinstance(data, list) else data.get("directives", [])
                if directives:
                    logger.info("Pulled %d directive(s) from GhostBrain", len(directives))
                return directives
        except urllib.error.URLError as exc:
            logger.debug("GhostBrain directive pull failed: %s", exc)
            return []
        except json.JSONDecodeError:
            return []

    # ------------------------------------------------------------------
    # Spool flush
    # ------------------------------------------------------------------

    def flush_spool(self) -> int:
        """Attempt to push spooled signals.  Returns number successfully sent."""
        sent = 0
        remaining: list[dict[str, Any]] = []
        while self._spool:
            payload = self._spool.popleft()
            if self._push_signal(payload):
                sent += 1
            else:
                remaining.append(payload)
                break   # still unreachable — stop trying
        for item in remaining:
            self._spool.appendleft(item)
        if sent:
            logger.info("Flushed %d spooled signal(s) to GhostBrain", sent)
        return sent

    # ------------------------------------------------------------------
    # Context retrieval (risk augmentation — read-only)
    # ------------------------------------------------------------------

    def get_context(self, topic: str) -> dict[str, Any]:
        """
        Fetch GhostBrain context for a topic (e.g. "security", "routing").
        Used to augment analysis decisions.
        """
        url = f"{self._url}/api/v1/context?topic={topic}&agent={self._agent_id}"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError):
            return {}

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _push_signal(self, payload: dict[str, Any]) -> bool:
        url  = f"{self._url}/api/v1/signals"
        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return resp.status in (200, 201, 202)
        except urllib.error.URLError:
            return False
        except Exception:  # noqa: BLE001
            return False

    def _write_spool_file(self, payload: dict[str, Any]) -> None:
        """Persist a single failed signal to disk so it survives restarts."""
        self._spool_dir.mkdir(parents=True, exist_ok=True)
        fname = self._spool_dir / f"signal-{int(time.time() * 1000)}.json"
        try:
            fname.write_text(json.dumps(payload), encoding="utf-8")
        except OSError as exc:
            logger.debug("Could not write spool file: %s", exc)
