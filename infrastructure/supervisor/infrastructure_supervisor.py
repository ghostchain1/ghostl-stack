"""
Infrastructure Supervisor — central Python control daemon.

Orchestrates:
  - VM health monitoring + auto-restart (allowlisted VMs only)
  - Container health monitoring + auto-restart (allowlisted containers only)
  - System metrics collection
  - Scaling signals → forwarded to GhostBrain signing relay (human-ratified)

Security:
  - No shell=True anywhere.
  - Allowlists control which VMs/containers are managed.
  - Signing relay handles all governance actions — no autonomous chain writes.
  - GhostBrain API is consulted for risk augmentation (read-only).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

from vm_manager        import VMManager
from container_manager import ContainerManager
from health_monitor    import HealthMonitor, SystemMetrics
from load_balancer     import LoadBalancer, ValidatorNode
from scaling_engine    import ScalingEngine, ScaleAction

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("InfrastructureSupervisor")

# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------

MONITOR_INTERVAL     = int(os.environ.get("MONITOR_INTERVAL",      "10"))
GHOSTBRAIN_API_URL   = os.environ.get("GHOSTBRAIN_API_URL",         "http://localhost:7900")
SIGNING_RELAY_URL    = os.environ.get("SIGNING_RELAY_URL",          "http://localhost:7910")
GHOSTBRAIN_ENABLED   = os.environ.get("GHOSTBRAIN_ENABLED",         "1") == "1"

# Comma-separated allowlists — empty = no automatic restarts.
VM_ALLOWLIST: set[str] = set(
    x.strip() for x in os.environ.get("VM_ALLOWLIST", "").split(",") if x.strip()
)
CONTAINER_ALLOWLIST: set[str] = set(
    x.strip() for x in os.environ.get("CONTAINER_ALLOWLIST", "").split(",") if x.strip()
)
# Comma-separated list of validator VM names used for load-balancing reports.
VALIDATOR_NAMES: list[str] = [
    x.strip() for x in os.environ.get("VALIDATOR_NAMES", "").split(",") if x.strip()
]


# ---------------------------------------------------------------------------
# Signing relay helper
# ---------------------------------------------------------------------------

def _post_json(url: str, payload: dict, timeout: int = 10) -> Optional[dict]:
    """HTTP POST with JSON body. Returns parsed response or None on error."""
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as exc:
        logger.warning("HTTP POST to %s failed: %s", url, exc)
        return None


def _forward_scale_signal(signal_reason: str, metrics: SystemMetrics) -> None:
    """Forward a scale signal to the signing relay for human ratification."""
    payload = {
        "type":        "scale_request",
        "description": signal_reason,
        "metrics": {
            "cpu_percent":    metrics.cpu_percent,
            "memory_percent": metrics.memory_percent,
        },
        "chain_id":  14000101,
        "gas_token": "GST",
        "from":      "infra-supervisor",
    }
    result = _post_json(f"{SIGNING_RELAY_URL}/relay/sign_and_submit", payload)
    if result:
        logger.info("Scale signal forwarded to relay — pending id: %s", result.get("pending_id"))
    else:
        logger.warning("Failed to forward scale signal to relay.")


def _push_ghostbrain_telemetry(metrics: SystemMetrics, vm_states: list[dict], unhealthy_containers: list[str]) -> None:
    """Fire-and-forget telemetry heartbeat to GhostBrain Core."""
    if not GHOSTBRAIN_ENABLED:
        return
    payload = {
        "source":    "infra-supervisor",
        "type":      "infra.heartbeat",
        "chain_id":  14000101,
        "gas_token": "GST",
        "ts":        int(time.time()),
        "metrics": {
            "cpu_percent":    metrics.cpu_percent,
            "memory_percent": metrics.memory_percent,
            "disk_percent":   metrics.disk_percent,
            "load_1m":        metrics.load_1m,
        },
        "vm_states":            vm_states,
        "unhealthy_containers": unhealthy_containers,
    }
    _post_json(f"{GHOSTBRAIN_API_URL}/api/v1/signals", payload, timeout=3)


# ---------------------------------------------------------------------------
# InfrastructureSupervisor
# ---------------------------------------------------------------------------

class InfrastructureSupervisor:
    def __init__(self) -> None:
        self.vm        = VMManager()
        self.containers = ContainerManager()
        self.health    = HealthMonitor()
        self.scaler    = ScalingEngine()
        self.balancer  = LoadBalancer()

    def run(self) -> None:
        logger.info(
            "InfrastructureSupervisor starting. interval=%ds vm_allowlist=%s container_allowlist=%s",
            MONITOR_INTERVAL,
            VM_ALLOWLIST or "(none)",
            CONTAINER_ALLOWLIST or "(none)",
        )

        while True:
            try:
                self._cycle()
            except KeyboardInterrupt:
                logger.info("Supervisor interrupted — shutting down.")
                break
            except Exception as exc:
                logger.error("Supervisor cycle error: %s", exc, exc_info=True)

            time.sleep(MONITOR_INTERVAL)

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    def _cycle(self) -> None:
        # 1. Collect system metrics.
        metrics = self.health.system_metrics()
        logger.info(
            "Metrics: cpu=%.1f%% mem=%.1f%% disk=%.1f%% load_1m=%.2f",
            metrics.cpu_percent,
            metrics.memory_percent,
            metrics.disk_percent,
            metrics.load_1m,
        )

        # 2. Evaluate scaling.
        signal = self.scaler.check({
            "cpu":    metrics.cpu_percent,
            "memory": metrics.memory_percent,
        })
        if signal and signal.action != ScaleAction.NONE:
            logger.warning("Scale signal: %s — %s", signal.action.value, signal.reason)
            if signal.urgency in ("medium", "high"):
                _forward_scale_signal(signal.reason, metrics)

        # 3. VM health check — collect states for telemetry.
        vm_states = self._check_vms()

        # 4. Container health check — collect names for telemetry.
        unhealthy_containers = self._check_containers()

        # 5. Validator load-balancer report (logged; no autonomous routing change).
        self._report_validator_balance(vm_states)

        # 6. Telemetry heartbeat to GhostBrain.
        _push_ghostbrain_telemetry(metrics, vm_states, unhealthy_containers)

    def _check_vms(self) -> list[dict]:
        """Check VMs; restart allowlisted ones that are down. Returns list of {name, state} dicts."""
        try:
            vms = self.vm.list_vms()
        except Exception as exc:
            logger.warning("VM list failed: %s", exc)
            return []

        for vm in vms:
            name  = vm["name"]
            state = vm["state"]
            if state in ("shutoff", "crashed"):
                if name not in VM_ALLOWLIST:
                    logger.debug("VM %r is %s but not in allowlist — skipping.", name, state)
                    continue
                logger.warning("VM %r is %s — attempting restart.", name, state)
                try:
                    self.vm.restart_vm(name)
                except Exception as exc:
                    logger.error("Failed to restart VM %r: %s", name, exc)

        return vms

    def _check_containers(self) -> list[str]:
        """Restart allowlisted unhealthy containers. Returns list of unhealthy container names."""
        try:
            unhealthy = self.containers.unhealthy()
        except Exception as exc:
            logger.warning("Container list failed: %s", exc)
            return []

        for name in unhealthy:
            if name not in CONTAINER_ALLOWLIST:
                logger.debug("Container %r unhealthy but not in allowlist — skipping.", name)
                continue
            logger.warning("Container %r unhealthy — restarting.", name)
            try:
                self.containers.restart(name)
            except Exception as exc:
                logger.error("Failed to restart container %r: %s", name, exc)

        return unhealthy

    def _report_validator_balance(self, vm_states: list[dict]) -> None:
        """
        Build ValidatorNode entries from the live VM list and log a load report.
        Only VMs whose names are in VALIDATOR_NAMES (env) are included.
        No traffic routing is changed here — report is advisory and logged only.
        """
        if not VALIDATOR_NAMES:
            return
        nodes: list[ValidatorNode] = []
        state_map = {v["name"]: v["state"] for v in vm_states}
        for vname in VALIDATOR_NAMES:
            is_up = state_map.get(vname, "shutoff") == "running"
            nodes.append(ValidatorNode(name=vname, healthy=is_up))
        report = self.balancer.report(nodes)
        if report:
            logger.info("Validator load report (advisory): %s", report)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    InfrastructureSupervisor().run()
