#!/usr/bin/env python3
"""
GhostStack Autonomous AI Engineering Agent — Infrastructure Interface
=====================================================================
HTTP client for the GAIS REST API (:9100) and the Infrastructure Supervisor.

All write operations are advisory — this module only reads status and submits
directives.  Directives flow: engineering agent → GAIS → human-ratified action.

No shell=True.  No autonomous on-chain writes.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger("InfrastructureInterface")


class InfrastructureInterface:
    """Read-only + directive client for the GAIS REST API."""

    def __init__(self, config: dict[str, Any]) -> None:
        self._gais_url   = config.get("gais_url",   "http://localhost:9100")
        self._api_token  = config.get("gais_api_token", "")  # X-GAIS-Token header
        self._timeout    = 8

    # ------------------------------------------------------------------
    # Read endpoints (unauthenticated)
    # ------------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        return self._get("/status")

    def get_vms(self) -> list[dict[str, Any]]:
        data = self._get("/vms")
        return data if isinstance(data, list) else []

    def get_healing(self) -> dict[str, Any]:
        return self._get("/healing")

    def get_scaling(self) -> dict[str, Any]:
        return self._get("/scaling")

    def get_validators(self) -> dict[str, Any]:
        return self._get("/validators")

    def get_proposals(self) -> list[dict[str, Any]]:
        data = self._get("/proposals")
        return data if isinstance(data, list) else []

    # ------------------------------------------------------------------
    # Write endpoints (require X-GAIS-Token)
    # ------------------------------------------------------------------

    def restart_vm(self, name: str) -> dict[str, Any]:
        """Submit an advisory VM restart request to GAIS."""
        return self._post(f"/vms/{name}/restart", {})

    def submit_directive(self, directive: dict[str, Any]) -> dict[str, Any]:
        """
        Submit a GhostBrain directive to GAIS.
        Supported types: vm.restart, healer.reset, escalation.clear
        """
        return self._post("/directives", directive)

    def reset_healer(self, vm_name: str) -> dict[str, Any]:
        return self._post(f"/vms/{vm_name}/heal/reset", {})

    def clear_escalation(self, vm_name: str) -> dict[str, Any]:
        return self._post(f"/vms/{vm_name}/escalation/clear", {})

    # ------------------------------------------------------------------
    # Container helpers (direct Docker — fallback when GAIS unreachable)
    # ------------------------------------------------------------------

    def list_unhealthy_containers(self) -> list[str]:
        """
        Returns container names whose status is not 'running'.
        Uses the GAIS /status and /vms endpoints; no Docker socket access
        required from this process.
        """
        status = self.get_status()
        unhealthy = status.get("unhealthy_containers", [])
        return unhealthy if isinstance(unhealthy, list) else []

    # ------------------------------------------------------------------
    # Infra health summary (for GhostBrain telemetry)
    # ------------------------------------------------------------------

    def health_summary(self) -> dict[str, Any]:
        status = self.get_status()
        vms    = self.get_vms()
        return {
            "gais_reachable": bool(status),
            "vm_count_total": len(vms),
            "vm_count_up":    sum(1 for v in vms if v.get("state") == "running"),
            "healing_active": status.get("healing_active", False),
            "proposals_pending": len(self.get_proposals()),
        }

    # ------------------------------------------------------------------
    # Low-level HTTP helpers
    # ------------------------------------------------------------------

    def _get(self, path: str) -> Any:
        url = self._gais_url.rstrip("/") + path
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            logger.debug("GAIS GET %s failed: %s", path, exc)
            return {}
        except json.JSONDecodeError:
            return {}

    def _post(self, path: str, payload: dict[str, Any]) -> Any:
        url  = self._gais_url.rstrip("/") + path
        body = json.dumps(payload).encode("utf-8")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_token:
            headers["X-GAIS-Token"] = self._api_token
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            logger.warning("GAIS POST %s failed: %s", path, exc)
            return {"error": str(exc)}
        except json.JSONDecodeError:
            return {}
