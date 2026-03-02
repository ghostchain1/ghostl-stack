"""
GhostStack Hypervisor Supervisor
---------------------------------
Scrapes VM state via libvirt (virsh) and exposes Prometheus metrics on :9108.
Also reports VM health signals to GhostBrain Core via its HTTP API.

Enforced routing law:
  L3 → L2 → L1  (no L3 → L1 edge ever published)

Metrics exported:
  ghoststack_vm_up{vm}              — 1 if running
  ghoststack_vm_has_ip{vm}         — 1 if DHCP lease visible
  ghoststack_rpc_ok{vm,ip,port}    — 1 if web3_clientVersion responds
  ghoststack_topology_edge{from,to} — static topology graph (1=edge exists)
"""
from __future__ import annotations

import os
import subprocess
import time
import re
import uuid
import urllib.request
import json
import logging
import threading

from prometheus_client import start_http_server, Gauge, REGISTRY, PROCESS_COLLECTOR, PLATFORM_COLLECTOR

# ──────────────────────────────────────────────────────────────
# Configuration (all overridable via env)
# ──────────────────────────────────────────────────────────────
VM_NAMES: list[str] = [
    os.getenv("VM_L1_MAINNET",           "ghostchain-mainnet-l1"),
    os.getenv("VM_L1_TESTNET",           "ghostchain-testnet-l1"),
    os.getenv("VM_L1_VALIDATOR_MAINNET", "ghost-mainnet-validator"),
    os.getenv("VM_L1_VALIDATOR_TESTNET", "ghost-testnet-validator"),
    os.getenv("VM_L1_ARCHIVE",           "ghost-mainnet-archive-node"),
    os.getenv("VM_L2_MAINNET",           "ghostl2-mainnet"),
    os.getenv("VM_L2_TESTNET",           "ghostl2-testnet"),
    os.getenv("VM_L3_MAINNET",           "ghostl3-mainnet"),
    os.getenv("VM_L3_TESTNET",           "ghostl3-testnet"),
]

RPC_PORT       = int(os.getenv("RPC_PORT",        "8545"))
SUPERVISOR_PORT = int(os.getenv("SUPERVISOR_PORT", "9108"))
SCRAPE_INTERVAL = int(os.getenv("SCRAPE_INTERVAL", "10"))

# ──────────────────────────────────────────────────────────────
# GhostBrain Core — HTTP signal gateway
# ──────────────────────────────────────────────────────────────
GHOSTBRAIN_URL       = os.getenv("GHOSTBRAIN_URL", "http://ghostbrain-core:7900")
GHOSTBRAIN_ENABLED   = os.getenv("GHOSTBRAIN_ENABLED", "true").lower() == "true"
AGENT_ID             = "hypervisor-supervisor"

_vm_layer_map: dict[str, str] = {
    "l1": "L1", "l2": "L2", "l3": "L3",
}

def _vm_layer(vm_name: str) -> str:
    """Infer layer from VM name for signal metadata."""
    lower = vm_name.lower()
    for key, layer in _vm_layer_map.items():
        if key in lower:
            return layer
    return "L1"  # default

def _post_json(url: str, data: dict) -> None:
    """Fire-and-forget JSON POST; errors are logged but never raised."""
    try:
        payload = json.dumps(data).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            _ = resp.read()
    except Exception as exc:
        logger.debug("GhostBrain POST failed (%s): %s", url, exc)

def _register_with_ghostbrain() -> None:
    """Register this supervisor as a GhostBrain agent (best-effort)."""
    if not GHOSTBRAIN_ENABLED:
        return
    _post_json(f"{GHOSTBRAIN_URL}/api/v1/agents/register", {
        "agentId": AGENT_ID,
        "role": "sentinel",
        "capabilities": ["libvirt.status"],
        "resourceScopes": [
            {"type": "vm", "name": vm, "layer": _vm_layer(vm)}
            for vm in VM_NAMES
        ],
        "natsSubject": f"ghostbrain.agent.{AGENT_ID}.task",
        "healthy": True,
    })
    logger.info("Registered with GhostBrain Core at %s", GHOSTBRAIN_URL)

def _publish_vm_signal(vm: str, running: bool, ip: str, rpc_ok: bool) -> None:
    """Publish VM health signal to GhostBrain Core via HTTP."""
    if not GHOSTBRAIN_ENABLED:
        return
    anomaly = not running
    _post_json(f"{GHOSTBRAIN_URL}/api/v1/signals", {
        "signalId": str(uuid.uuid4()),
        "source": "libvirt",
        "service": vm,
        "layer": _vm_layer(vm),
        "metric": "vm.running",
        "value": 1 if running else 0,
        "threshold": 1,
        "logLine": f"VM {vm}: running={running} ip={ip or 'none'} rpc={rpc_ok}",
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "anomaly": anomaly,
    })
    # Additional RPC signal when VM has an IP
    if ip:
        _post_json(f"{GHOSTBRAIN_URL}/api/v1/signals", {
            "signalId": str(uuid.uuid4()),
            "source": "libvirt",
            "service": vm,
            "layer": _vm_layer(vm),
            "metric": "vm.rpc.healthy",
            "value": 1 if rpc_ok else 0,
            "threshold": 1,
            "logLine": f"RPC check {vm} ({ip}:{RPC_PORT}): {'ok' if rpc_ok else 'fail'}",
            "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "anomaly": not rpc_ok,
        })

# ──────────────────────────────────────────────────────────────
# Topology (published once; L3→L1 edge is intentionally absent)
# ──────────────────────────────────────────────────────────────
TOPOLOGY_EDGES: list[tuple[str, str]] = [
    ("GhostL3-mainnet", "GhostL2-mainnet"),
    ("GhostL3-testnet", "GhostL2-testnet"),
    ("GhostL2-mainnet", "GhostL1-mainnet"),
    ("GhostL2-testnet", "GhostL1-testnet"),
]

# ──────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [supervisor] %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Prometheus gauges
# ──────────────────────────────────────────────────────────────
g_vm_up      = Gauge("ghoststack_vm_up",      "VM running state (1=running)",           ["vm"])
g_vm_has_ip  = Gauge("ghoststack_vm_has_ip",  "VM has IP visible via domifaddr (1=yes)", ["vm"])
g_rpc_ok     = Gauge("ghoststack_rpc_ok",     "RPC health check ok (1=ok)",              ["vm", "ip", "port"])
g_topo_edge  = Gauge("ghoststack_topology_edge", "Topology edge present (1=exists)",    ["from_node", "to_node"])

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
def _sh(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError as exc:
        return exc.output or ""


def vm_running(vm: str) -> bool:
    out = _sh(["virsh", "domstate", vm]).strip().lower()
    return "running" in out


def vm_ip(vm: str) -> str:
    """Return first IPv4 from domifaddr, or ''."""
    out = _sh(["virsh", "domifaddr", vm])
    m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})/\d+", out)
    return m.group(1) if m else ""


def rpc_healthy(ip: str, port: int) -> bool:
    payload = json.dumps({"jsonrpc": "2.0", "method": "web3_clientVersion", "params": [], "id": 1}).encode()
    url = f"http://{ip}:{port}"
    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def publish_topology() -> None:
    for from_node, to_node in TOPOLOGY_EDGES:
        g_topo_edge.labels(from_node, to_node).set(1)
    logger.info("Topology edges published: %d", len(TOPOLOGY_EDGES))


# ──────────────────────────────────────────────────────────────
# Scrape loop
# ──────────────────────────────────────────────────────────────
def scrape() -> None:
    for vm in VM_NAMES:
        running = vm_running(vm)
        g_vm_up.labels(vm).set(1 if running else 0)

        ip = vm_ip(vm) if running else ""
        g_vm_has_ip.labels(vm).set(1 if ip else 0)

        ok = rpc_healthy(ip, RPC_PORT) if ip else False
        g_rpc_ok.labels(vm, ip or "none", str(RPC_PORT)).set(1 if ok else 0)

        status = "up" if running else "off"
        rpc_status = "ok" if ok else ("no-ip" if not ip else "down")
        logger.info("%-40s  state=%-8s  ip=%-15s  rpc=%s", vm, status, ip or "—", rpc_status)

        # Report to GhostBrain Core (non-blocking, fire-and-forget)
        threading.Thread(
            target=_publish_vm_signal,
            args=(vm, running, ip, ok),
            daemon=True,
        ).start()


def main() -> None:
    start_http_server(SUPERVISOR_PORT)
    logger.info("Metrics server started on :%d", SUPERVISOR_PORT)
    publish_topology()

    # Register with GhostBrain Core (best-effort, non-blocking)
    threading.Thread(target=_register_with_ghostbrain, daemon=True).start()

    while True:
        try:
            scrape()
        except Exception as exc:
            logger.error("Scrape error: %s", exc)
        time.sleep(SCRAPE_INTERVAL)


if __name__ == "__main__":
    main()
