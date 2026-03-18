#!/usr/bin/env python3
"""
GhostStack Hypervisor Supervisor
---------------------------------
Scrapes VM state via libvirt (virsh) and exposes Prometheus metrics on :9108.
Also reports VM health signals to GhostBrain Core via its HTTP API.

Enforced routing law:
  L3 → L2 → L1  (no L3 → L1 edge ever published)

Metrics exported:
  ghoststack_vm_up{vm}                 — 1 if running
  ghoststack_vm_has_ip{vm,method}      — 1 if IP is visible; "method" tag explains how it was found
  ghoststack_rpc_ok{vm,ip,port}        — 1 if ghost_blockNumber or eth_blockNumber responds
  ghoststack_topology_edge{from_node,to_node} — static topology graph (1=edge exists)

Environment variables (all optional):
  LISTEN_ADDR      default 0.0.0.0
  LISTEN_PORT      default 9108
  SCRAPE_INTERVAL  default 10  (seconds)
  VIRSH_URI        default qemu:///system
  RPC_PORT_L1      default 18545
  RPC_PORT_L2      default 29547
  RPC_PORT_L3      default 39545
  LIBVIRT_NETWORK  default gs-mgmt  (for DHCP lease fallback)
  GHOSTBRAIN_URL   default ""  (blank = disabled)
                   e.g. http://ghostbrain-core:7900/api/v1/signals
"""
from __future__ import annotations

import json
import logging
import os
import re
import socket
import subprocess
import time
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

try:
    from prometheus_client import Gauge, start_http_server
except ImportError:
    raise SystemExit(
        "prometheus_client not found.\n"
        "Install with:  pip install prometheus-client\n"
        "or:            apt-get install python3-prometheus-client"
    )

# ── Configuration ─────────────────────────────────────────────────────────────
LISTEN_ADDR     = os.getenv("LISTEN_ADDR", "0.0.0.0")
LISTEN_PORT     = int(os.getenv("LISTEN_PORT", "9108"))
SCRAPE_INTERVAL = int(os.getenv("SCRAPE_INTERVAL", "10"))
VIRSH_URI       = os.getenv("VIRSH_URI", "qemu:///system")
LIBVIRT_NETWORK = os.getenv("LIBVIRT_NETWORK", "gs-mgmt")

RPC_PORT_L1 = int(os.getenv("RPC_PORT_L1", "18545"))
RPC_PORT_L2 = int(os.getenv("RPC_PORT_L2", "29547"))
RPC_PORT_L3 = int(os.getenv("RPC_PORT_L3", "39545"))

GHOSTBRAIN_URL = os.getenv("GHOSTBRAIN_URL", "").strip()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [supervisor] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("supervisor")

# ── Prometheus metrics ────────────────────────────────────────────────────────
vm_up         = Gauge("ghoststack_vm_up",        "1 if VM is running",               ["vm"])
vm_has_ip     = Gauge("ghoststack_vm_has_ip",    "1 if VM has a visible IP",         ["vm", "method"])
rpc_ok        = Gauge("ghoststack_rpc_ok",       "1 if JSON-RPC probe succeeds",     ["vm", "ip", "port"])
topology_edge = Gauge("ghoststack_topology_edge","Topology edge (1=edge exists)",    ["from_node", "to_node"])


# ── VM inventory ──────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class VM:
    name:      str
    role:      str            # l1 | l2 | l3 | web | dns | devnet
    static_ip: Optional[str] = None   # None = discover dynamically


# Single source of truth for all VMs known to this hypervisor.
# Keep this in sync with create-vms.sh and inventory.sh.
VMS: List[VM] = [
    # Infrastructure
    VM("ghost-dns-slave",          "dns",    "10.50.99.66"),
    VM("ghost-web",                "web",    "10.50.99.10"),
    VM("ghostchain-devnet",        "devnet", "38.247.149.219"),
    # Testnet
    VM("ghostchain-testnet-l1",    "l1",     "10.50.99.71"),
    VM("ghost-testnet-validator",  "l1-validator", "10.50.99.73"),
    VM("ghostl2-testnet",          "l2",     "10.50.99.77"),
    VM("ghostl3-testnet",          "l3",     "10.50.99.79"),
    # Mainnet
    VM("ghostchain-mainnet-l1",    "l1",     "10.50.99.70"),
    VM("ghost-mainnet-validator",  "l1-validator", "10.50.99.72"),
    VM("ghostl2-mainnet",          "l2",     "10.50.99.76"),
    VM("ghostl3-mainnet",          "l3",     "10.50.99.78"),
]

# ── Topology — ROUTING LAW: L3 → L2 → L1 only.  NO L3 → L1 edges. ───────────
# Any edge added here that violates the law must be rejected.
TOPOLOGY_EDGES: List[Tuple[str, str]] = [
    # L3 → L2
    ("ghostl3-testnet",  "ghostl2-testnet"),
    ("ghostl3-mainnet",  "ghostl2-mainnet"),
    # L2 → L1
    ("ghostl2-testnet",  "ghostchain-testnet-l1"),
    ("ghostl2-mainnet",  "ghostchain-mainnet-l1"),
]

_ROLE_ORDER = {"l3": 3, "l2": 2, "l1": 1}

def _validate_topology(edges: List[Tuple[str, str]], vms: List[VM]) -> None:
    role_map = {v.name: v.role for v in vms}
    for a, b in edges:
        ra = _ROLE_ORDER.get(role_map.get(a, ""), 0)
        rb = _ROLE_ORDER.get(role_map.get(b, ""), 0)
        if ra == 3 and rb == 1:
            raise ValueError(
                f"Topology violation: edge {a!r} → {b!r} is L3→L1, "
                "which breaks the routing law (L3→L2→L1 only)."
            )

_validate_topology(TOPOLOGY_EDGES, VMS)


# ── Port mapping ──────────────────────────────────────────────────────────────
def rpc_port(role: str) -> Optional[int]:
    return {
        "devnet": RPC_PORT_L1,
        "l1": RPC_PORT_L1,
        "l1-validator": None,
        "l2": RPC_PORT_L2,
        "l3": RPC_PORT_L3,
    }.get(role)


# ── Shell helpers ─────────────────────────────────────────────────────────────
def _run(cmd: List[str], timeout: int = 8) -> Tuple[int, str]:
    try:
        p = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            check=False,
        )
        return p.returncode, (p.stdout or "").strip()
    except Exception as exc:
        return 999, f"{type(exc).__name__}: {exc}"


def virsh(*args: str, timeout: int = 8) -> Tuple[int, str]:
    return _run(["virsh", "-c", VIRSH_URI, *args], timeout=timeout)


# ── libvirt queries ───────────────────────────────────────────────────────────
def get_domstate(name: str) -> str:
    """Returns 'running', 'shut off', 'paused', 'unknown', etc."""
    rc, out = virsh("domstate", name)
    if rc != 0:
        return "unknown"
    return out.splitlines()[-1].strip().lower()


_IPV4_RE = re.compile(r"(\d{1,3}(?:\.\d{1,3}){3})/(\d+)")


def discover_ip(vm: VM) -> Tuple[Optional[str], str]:
    """Return (ip_string, method) where method explains how we found the IP."""

    # 1) Static config wins.
    if vm.static_ip:
        return vm.static_ip, "static"

    # 2) domifaddr (works best when qemu-guest-agent is inside the VM).
    rc, out = virsh("domifaddr", vm.name, timeout=5)
    if rc == 0:
        for m in _IPV4_RE.finditer(out):
            ip = m.group(1)
            if not ip.startswith("169."):          # skip link-local
                return ip, "domifaddr"

    # 3) DHCP leases on the management network.
    rc, out = virsh("net-dhcp-leases", LIBVIRT_NETWORK, timeout=5)
    if rc == 0:
        for line in out.splitlines():
            if vm.name not in line:
                continue
            m = _IPV4_RE.search(line)
            if m:
                return m.group(1), "dhcp"

    return None, "none"


# ── RPC health probe ──────────────────────────────────────────────────────────
def rpc_healthy(ip: str, port: int) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=0.5):
            pass
    except OSError:
        return False

    for method in ("ghost_blockNumber", "eth_blockNumber"):
        body = json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": method, "params": []}
        ).encode()
        req = urllib.request.Request(
            url=f"http://{ip}:{port}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                payload = json.loads(resp.read())
            if isinstance(payload.get("result"), str) and payload["result"].startswith("0x"):
                return True
        except Exception:
            continue
    return False


# ── GhostBrain signal publisher ───────────────────────────────────────────────
def _post_json(url: str, payload: Dict) -> None:
    """Fire-and-forget JSON POST; errors are logged but never raised."""
    try:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            url=url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2).read()
    except Exception as exc:
        log.debug("GhostBrain POST to %s failed: %s", url, exc)


def _brain_message(subject: str, sender: str, payload: Dict, correlation_id: Optional[str] = None) -> Dict:
    return {
        "messageId": str(uuid.uuid4()),
        "subject": subject,
        "correlationId": correlation_id or f"{sender}:{int(time.time())}",
        "senderAgentId": sender,
        "payload": payload,
        "sentAt": datetime.now(timezone.utc).isoformat(),
    }


def publish_vm_signal(vm: VM, is_up: bool, ip: Optional[str], rpc: Optional[bool]) -> None:
    if not GHOSTBRAIN_URL:
        return
    _post_json(
        GHOSTBRAIN_URL,
        _brain_message(
            "infra.vm.status",
            "hypervisor-supervisor",
            {
                "source": "hypervisor-supervisor",
                "type": "vm.status",
                "vm": vm.name,
                "role": vm.role,
                "running": is_up,
                "ip": ip or "",
                "rpc_ok": rpc,
            },
            correlation_id=f"vm-status:{vm.name}:{int(time.time())}",
        ),
    )


# ── Main scrape loop ──────────────────────────────────────────────────────────
def publish_topology() -> None:
    for a, b in TOPOLOGY_EDGES:
        topology_edge.labels(from_node=a, to_node=b).set(1.0)
    log.info("Topology edges published: %d", len(TOPOLOGY_EDGES))


def scrape_once() -> None:
    for vm in VMS:
        state   = get_domstate(vm.name)
        is_up   = state == "running"
        ip, how = discover_ip(vm)
        port    = rpc_port(vm.role)

        rpc_result: Optional[bool] = None
        if ip and port:
            rpc_result = rpc_healthy(ip, port)
            if not is_up and state == "unknown" and rpc_result:
                state = "running (rpc-probe)"
                is_up = True
            rpc_ok.labels(vm=vm.name, ip=ip, port=str(port)).set(1.0 if rpc_result else 0.0)

        vm_up.labels(vm=vm.name).set(1.0 if is_up else 0.0)
        vm_has_ip.labels(vm=vm.name, method=how).set(1.0 if ip else 0.0)

        log.info(
            "%-35s  state=%-10s  ip=%-16s  rpc=%s",
            vm.name,
            state,
            ip or "—",
            ("ok" if rpc_result else "fail") if rpc_result is not None else "n/a",
        )
        publish_vm_signal(vm, is_up, ip, rpc_result)


def main() -> None:
    log.info("Starting GhostStack Hypervisor Supervisor on %s:%d", LISTEN_ADDR, LISTEN_PORT)
    log.info("Topology law: L3→L2→L1 only (%d edges)", len(TOPOLOGY_EDGES))
    if GHOSTBRAIN_URL:
        log.info("GhostBrain signals → %s", GHOSTBRAIN_URL)
    else:
        log.info("GhostBrain signals disabled (GHOSTBRAIN_URL not set)")

    start_http_server(LISTEN_PORT, addr=LISTEN_ADDR)
    log.info("Metrics server started on :%d", LISTEN_PORT)

    if GHOSTBRAIN_URL:
        _post_json(
            GHOSTBRAIN_URL,
            _brain_message(
                "infra.supervisor.start",
                "hypervisor-supervisor",
                {"source": "hypervisor-supervisor", "type": "supervisor_start"},
            ),
        )
    publish_topology()

    while True:
        try:
            scrape_once()
        except Exception as exc:
            log.error("Scrape error: %s", exc, exc_info=True)
        time.sleep(SCRAPE_INTERVAL)


if __name__ == "__main__":
    main()
