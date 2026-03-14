#!/usr/bin/env python3
"""
GhostStack AI Swarm — Infrastructure AI Agent
==============================================
Reads VM and container health from the GAIS REST API and the Infrastructure
Supervisor.  Publishes node alerts and submits advisory repair directives.

Data flow
---------
  GAIS :9100 /vms, /healing, /scaling, /status
    → InfrastructureAgent (reads, classifies)
    → SwarmBus "infra:node_alert" (per degraded VM)
    → GAIS /directives  (advisory restart request for ESCALATED VMs only)
    → SwarmBus "infra:repair_result"

Safety
------
• Agent never calls docker/libvirt directly — all control goes via GAIS.
• ESCALATED VMs require human confirmation; agent logs but does not auto-restart.
• No shell=True.
"""

from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request
import json
from typing import Any

from agents.base_agent import BaseSwarmAgent, AgentReport, AgentRecommendation, SwarmContext

logger = logging.getLogger("InfrastructureAgent")

_GAIS_VM_STATES_WARN  = {"paused", "pmsuspended"}
_GAIS_VM_STATES_CRIT  = {"shutoff", "crashed", "unknown"}


class InfrastructureAgent(BaseSwarmAgent):
    ROLE = "infrastructure"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._gais_url  = config.get("gais_url",  "http://localhost:9100")
        self._api_token = config.get("gais_api_token", "")
        self._timeout   = 8

    def act(self, context: SwarmContext) -> AgentReport:
        t0   = time.monotonic()
        recs: list[AgentRecommendation] = []

        status = self._get("/status")
        vms    = self._get_list("/vms")
        heal   = self._get("/healing")

        gais_up = bool(status)

        # VM health
        for vm in vms:
            name  = vm.get("name", "unknown")
            state = vm.get("state", "unknown")
            healer= heal.get(name, {}).get("level", "HEALTHY")

            if state in _GAIS_VM_STATES_CRIT:
                priority = 95
                context.bus.publish("infra:node_alert", self.name, {
                    "nodeName":  name,
                    "alertKind": "vm_offline",
                    "reason":    f"libvirt state={state}",
                })
                # Advisory directive — GAIS will still require human if escalated
                if healer != "ESCALATED":
                    self._submit_directive({"type": "vm.restart", "target": name})
                recs.append(AgentRecommendation(
                    kind="infra.vm_offline",
                    target=name,
                    confidence=0.95,
                    priority=priority,
                    description=f"VM {name} is {state} (healer={healer})",
                ))
            elif state in _GAIS_VM_STATES_WARN:
                recs.append(AgentRecommendation(
                    kind="infra.vm_degraded",
                    target=name,
                    confidence=0.7,
                    priority=70,
                    description=f"VM {name} is {state}",
                ))

        # Container health (aggregated from GAIS status)
        unhealthy_containers: list[str] = status.get("unhealthy_containers", [])
        for cname in unhealthy_containers:
            context.bus.publish("infra:node_alert", self.name, {
                "nodeName":  cname,
                "alertKind": "container_unhealthy",
            })
            recs.append(AgentRecommendation(
                kind="infra.container_unhealthy",
                target=cname,
                confidence=0.85,
                priority=80,
                description=f"Container {cname} unhealthy",
            ))

        elapsed = int((time.monotonic() - t0) * 1000)
        return AgentReport(
            agent_name=self.name,
            role=self.ROLE,
            healthy=gais_up,
            duration_ms=elapsed,
            recommendations=recs,
            summary=(
                f"GAIS={'UP' if gais_up else 'DOWN'} "
                f"VMs={len(vms)} "
                f"unhealthy_containers={len(unhealthy_containers)}"
            ),
        )

    # ------------------------------------------------------------------

    def _get(self, path: str) -> dict[str, Any]:
        try:
            url = self._gais_url.rstrip("/") + path
            with urllib.request.urlopen(
                urllib.request.Request(url), timeout=self._timeout
            ) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, json.JSONDecodeError, OSError):
            return {}

    def _get_list(self, path: str) -> list[dict[str, Any]]:
        data = self._get(path)
        return data if isinstance(data, list) else []

    def _submit_directive(self, directive: dict[str, Any]) -> None:
        url  = self._gais_url.rstrip("/") + "/directives"
        body = json.dumps(directive).encode("utf-8")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_token:
            headers["X-GAIS-Token"] = self._api_token
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self._timeout):
                pass
        except urllib.error.URLError as exc:
            logger.debug("GAIS directive failed: %s", exc)
