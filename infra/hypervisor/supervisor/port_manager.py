"""
GhostStack AI-Powered Port Manager
====================================
Manages iptables DNAT rules, LIBVIRT_FWI FORWARD rules, and UFW route rules
that map public IPs:ports → libvirt VM internal IPs:ports.

Features
--------
* Registry      — JSON persistence of all known port mappings with metadata
* Import        — parses existing iptables rules on first startup
* AI Suggest    — role-aware port recommender (l1/l2/l3/validator/web/devnet)
* Conflict guard — checks public_ip:port collisions before applying
* Apply/Remove  — idempotent iptables PREROUTING + LIBVIRT_FWI + UFW write
* Orphan detect — finds DNAT rules with no registered VM or non-running lease
* Persist       — iptables-save → /etc/iptables/rules.v4 after every change
* DRY_RUN       — PORT_MANAGER_DRY_RUN=1 logs changes without writing

Public IP inventory (GhostStack)
---------------------------------
  38.247.149.218 – 38.247.149.224   (7 static IPs, 1:1 VM assignment)
  208.110.71.164                    (hypervisor main, overflow using high ports)

Environment variables
---------------------
  PORT_MANAGER_DRY_RUN   "1" to skip iptables writes (default: 0)
  PORT_REGISTRY_FILE     JSON registry path (default: .tmp/port_registry.json)
  HYPERVISOR_IP          hypervisor public IP (default: 208.110.71.164)
  PUBLIC_IP_POOL         comma-separated public IPs (default: 38.247.149.218-224)
  IPTABLES_RULES_FILE    iptables-persistent path (default: /etc/iptables/rules.v4)
  VIRSH_URI              libvirt URI (default: qemu:///system)
  LIBVIRT_IN_IFACE       inbound bridge (default: br0)
  LIBVIRT_OUT_IFACE      outbound bridge to VMs (default: virbr0)
  OVERFLOW_PORT_MIN      start port for hypervisor-IP overflow range (default: 10000)
  OVERFLOW_PORT_MAX      end port for hypervisor-IP overflow range (default: 59999)
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import re
import socket
import subprocess
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

log = logging.getLogger("port_manager")

# ── Configuration ──────────────────────────────────────────────────────────────
DRY_RUN = os.getenv("PORT_MANAGER_DRY_RUN", "0") == "1"

_REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_FILE = Path(
    os.getenv("PORT_REGISTRY_FILE", str(_REPO_ROOT / ".tmp" / "port_registry.json"))
)
IPTABLES_RULES_FILE = Path(
    os.getenv("IPTABLES_RULES_FILE", "/etc/iptables/rules.v4")
)
HYPERVISOR_IP = os.getenv("HYPERVISOR_IP", "208.110.71.164")

_default_pool = ",".join(f"38.247.149.{n}" for n in range(218, 225))
PUBLIC_IP_POOL: List[str] = [
    ip.strip()
    for ip in os.getenv("PUBLIC_IP_POOL", _default_pool).split(",")
    if ip.strip()
]

LIBVIRT_IN_IFACE  = os.getenv("LIBVIRT_IN_IFACE",  "br0")
LIBVIRT_OUT_IFACE = os.getenv("LIBVIRT_OUT_IFACE", "virbr0")

OVERFLOW_PORT_MIN = int(os.getenv("OVERFLOW_PORT_MIN", "10000"))
OVERFLOW_PORT_MAX = int(os.getenv("OVERFLOW_PORT_MAX", "59999"))

VIRSH_URI = os.getenv("VIRSH_URI", "qemu:///system")

# Probe: TCP-connect timeout (seconds) when verifying VM reachability after mapping
PROBE_TIMEOUT_S      = float(os.getenv("PORT_PROBE_TIMEOUT_S",    "3.0"))
# VM lifecycle watcher: watch for newly running VMs and auto-apply port profiles
AUTO_MAP_NEW_VMS     = os.getenv("PORT_AUTO_MAP_NEW_VMS",    "0") == "1"
VM_WATCH_INTERVAL_S  = int(os.getenv("PORT_VM_WATCH_INTERVAL_S",  "30"))
# Ports on HYPERVISOR_IP that belong to the hypervisor — skipped in overflow suggestions
RESERVED_HYPER_PORTS: Set[int] = {
    int(p.strip())
    for p in os.getenv("PORT_RESERVED_HYPER", "22,80,443,9100,9108").split(",")
    if p.strip().isdigit()
}

# ── Well-known GhostChain service ports (label → port) ────────────────────────
GHOST_SERVICE_PORTS: Dict[str, int] = {
    "ssh":           22,
    "http":          80,
    "https":         443,
    # GhostChain L1 (Cosmos + EVM)
    "l1-rpc":        18545,
    "l1-ws":         18546,
    "l1-engine":     18552,
    "cosmos-lcd":    1317,
    "cosmos-grpc":   9090,
    "cometbft-rpc":  26657,
    "cometbft-p2p":  26656,
    # L2
    "l2-rpc":        29545,
    "l2-engine":     8551,
    "l2-p2p":        9222,
    # L3
    "l3-rpc":        39545,
    # GhostBrain
    "ghostbrain":    7900,
    # EVM p2p
    "geth-p2p-tcp":  30303,
    "geth-p2p-udp":  30303,
    # Generic EVM
    "evm-rpc":       8545,
    "evm-ws":        8546,
}

# ── Role port profiles — AI recommendation engine ────────────────────────────
# Each entry: (vm_port, label, protocol)  — protocol is "tcp" or "udp"
_ROLE_PROFILES: Dict[str, List[Tuple[int, str, str]]] = {
    "l1": [
        (22,    "ssh",          "tcp"),
        (80,    "http",         "tcp"),
        (443,   "https",        "tcp"),
        (1317,  "cosmos-lcd",   "tcp"),
        (9090,  "cosmos-grpc",  "tcp"),
        (26656, "cometbft-p2p", "tcp"),
        (26656, "cometbft-p2p", "udp"),
        (26657, "cometbft-rpc", "tcp"),
        (18545, "l1-rpc",       "tcp"),
        (18546, "l1-ws",        "tcp"),
        (30303, "geth-p2p",     "tcp"),
        (30303, "geth-p2p",     "udp"),
    ],
    "validator": [
        (22,    "ssh",          "tcp"),
        (26656, "cometbft-p2p", "tcp"),
        (26656, "cometbft-p2p", "udp"),
        (26657, "cometbft-rpc", "tcp"),
        (1317,  "cosmos-lcd",   "tcp"),
        (9090,  "cosmos-grpc",  "tcp"),
    ],
    "l2": [
        (22,    "ssh",       "tcp"),
        (80,    "http",      "tcp"),
        (443,   "https",     "tcp"),
        (29545, "l2-rpc",    "tcp"),
        (8546,  "evm-ws",    "tcp"),
        (8551,  "l2-engine", "tcp"),
        (9222,  "l2-p2p",    "tcp"),
        (9222,  "l2-p2p",    "udp"),
        (30303, "geth-p2p",  "tcp"),
        (30303, "geth-p2p",  "udp"),
    ],
    "l3": [
        (22,    "ssh",       "tcp"),
        (80,    "http",      "tcp"),
        (443,   "https",     "tcp"),
        (39545, "l3-rpc",    "tcp"),
        (8546,  "evm-ws",    "tcp"),
        (8551,  "l2-engine", "tcp"),
        (9222,  "l2-p2p",    "tcp"),
        (9222,  "l2-p2p",    "udp"),
        (30303, "geth-p2p",  "tcp"),
        (30303, "geth-p2p",  "udp"),
    ],
    "web": [
        (22,    "ssh",   "tcp"),
        (80,    "http",  "tcp"),
        (443,   "https", "tcp"),
    ],
    "dns": [
        (22,    "ssh", "tcp"),
        (53,    "dns", "tcp"),
        (53,    "dns", "udp"),
    ],
    "devnet": [
        (22,    "ssh",        "tcp"),
        (80,    "http",       "tcp"),
        (443,   "https",      "tcp"),
        (18545, "l1-rpc",     "tcp"),
        (29545, "l2-rpc",     "tcp"),
        (39545, "l3-rpc",     "tcp"),
        (7900,  "ghostbrain", "tcp"),
    ],
    "archive": [
        (22,    "ssh",     "tcp"),
        (18545, "l1-rpc",  "tcp"),
        (18546, "l1-ws",   "tcp"),
        (8545,  "evm-rpc", "tcp"),
        (8546,  "evm-ws",  "tcp"),
    ],
    "generic": [
        (22,    "ssh",   "tcp"),
        (80,    "http",  "tcp"),
        (443,   "https", "tcp"),
    ],
}

# ── Role detection from VM name patterns ─────────────────────────────────────
_ROLE_PATTERNS: List[Tuple[str, str]] = [
    # (pattern, role)  — checked in order; first match wins
    # validator patterns before l1 so "ghostchain-val1" is not mis-classified as l1
    (r"validator|\bval\d",                                             "validator"),
    (r"mainnet.*validator|validator.*mainnet|ghost-mainnet-validator", "validator"),
    (r"testnet.*validator|validator.*testnet|ghost-testnet-validator", "validator"),
    (r"ghostchain.*l1|l1[^0-9]|mainnet.*l1|testnet.*l1",             "l1"),
    (r"ghostl2|l2[^0-9]",                                             "l2"),
    (r"ghostl3|l3[^0-9]",                                             "l3"),
    (r"archive",                                                       "archive"),
    (r"web",                                                           "web"),
    (r"dns",                                                           "dns"),
    (r"devnet",                                                        "devnet"),
]


def detect_role(vm_name: str) -> str:
    """Infer a VM's functional role from its name."""
    name_lower = vm_name.lower()
    for pattern, role in _ROLE_PATTERNS:
        if re.search(pattern, name_lower):
            return role
    return "generic"


# ── Registry data model ──────────────────────────────────────────────────────
@dataclass
class Mapping:
    id:         str
    vm_name:    str
    vm_ip:      str
    vm_port:    int
    pub_ip:     str
    pub_port:   int
    protocol:   str            = "tcp"
    label:      str            = ""
    applied:    bool           = False
    source:     str            = "manual"   # "manual" | "import" | "ai-suggest" | "range"
    created_at: float          = field(default_factory=time.time)
    comment:    str            = ""
    probe_ok:   Optional[bool] = None     # None = not yet probed
    last_probe: float          = 0.0
    hit_count:  int            = 0        # last read from iptables counters

    def key(self) -> str:
        """Unique key for this public endpoint."""
        return f"{self.pub_ip}:{self.pub_port}/{self.protocol}"

    def fwd_comment(self) -> str:
        return self.comment or f"ghost-pm-{self.label or self.vm_port}"


@dataclass
class Registry:
    mappings:        List[Mapping] = field(default_factory=list)
    last_sync:       float         = 0.0
    last_import:     float         = 0.0


# ── Registry persistence ──────────────────────────────────────────────────────
_registry: Registry = Registry()


def _load_registry() -> None:
    global _registry
    REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_FILE.exists():
        _registry = Registry()
        return
    try:
        raw = json.loads(REGISTRY_FILE.read_text())
        mappings = [Mapping(**m) for m in raw.get("mappings", [])]
        _registry = Registry(
            mappings=mappings,
            last_sync=raw.get("last_sync", 0.0),
            last_import=raw.get("last_import", 0.0),
        )
        log.info("Port registry loaded: %d mappings.", len(_registry.mappings))
    except Exception as exc:
        log.error("Failed to load port registry: %s — starting fresh.", exc)
        _registry = Registry()


def _save_registry() -> None:
    REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "mappings":    [asdict(m) for m in _registry.mappings],
        "last_sync":   _registry.last_sync,
        "last_import": _registry.last_import,
    }
    REGISTRY_FILE.write_text(json.dumps(data, indent=2))


# ── Low-level iptables helpers ────────────────────────────────────────────────
def _ipt(*args: str, table: str = "filter", check: bool = False) -> Tuple[int, str]:
    """Run an iptables command safely (no shell=True)."""
    if DRY_RUN:
        log.info("[DRY_RUN] iptables -t %s %s", table, " ".join(args))
        return 0, ""
    cmd = ["iptables", "-t", table] + list(args)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0 and not check:
            log.warning("iptables %s: rc=%d stderr=%s", " ".join(args), result.returncode, result.stderr.strip())
        return result.returncode, result.stdout + result.stderr
    except FileNotFoundError:
        log.error("iptables binary not found")
        return 127, "iptables not found"
    except subprocess.TimeoutExpired:
        log.error("iptables command timed out")
        return 124, "timeout"


def _rule_exists_nat(m: Mapping) -> bool:
    rc, _ = _ipt(
        "-C", "PREROUTING",
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", f"{m.vm_ip}:{m.vm_port}",
        table="nat", check=True,
    )
    return rc == 0


def _rule_exists_output(m: Mapping) -> bool:
    rc, _ = _ipt(
        "-C", "OUTPUT",
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", f"{m.vm_ip}:{m.vm_port}",
        table="nat", check=True,
    )
    return rc == 0


def _rule_exists_fwi(m: Mapping) -> bool:
    rc, _ = _ipt(
        "-C", "LIBVIRT_FWI",
        "-d", f"{m.vm_ip}/32",
        "-i", LIBVIRT_IN_IFACE,
        "-o", LIBVIRT_OUT_IFACE,
        "-p", m.protocol,
        "-m", m.protocol,
        "--dport", str(m.vm_port),
        "-m", "comment",
        "--comment", m.fwd_comment(),
        "-j", "ACCEPT",
        table="filter", check=True,
    )
    return rc == 0


def _add_nat_dnat(m: Mapping) -> bool:
    """Idempotently add PREROUTING + OUTPUT DNAT rules (skip if already present)."""
    dnat_target = f"{m.vm_ip}:{m.vm_port}"
    pre_args = [
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", dnat_target,
    ]
    if _ipt("-C", "PREROUTING", *pre_args, table="nat", check=True)[0] == 0:
        log.debug("PREROUTING DNAT already exists for %s:%d → %s", m.pub_ip, m.pub_port, dnat_target)
        rc1 = 0
    else:
        rc1, _ = _ipt("-A", "PREROUTING", *pre_args, table="nat")

    out_args = [
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", dnat_target,
    ]
    if _ipt("-C", "OUTPUT", *out_args, table="nat", check=True)[0] == 0:
        rc2 = 0
    else:
        rc2, _ = _ipt("-A", "OUTPUT", *out_args, table="nat")
    return rc1 == 0 and rc2 == 0


def _del_nat_dnat(m: Mapping) -> None:
    _ipt(
        "-D", "PREROUTING",
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", f"{m.vm_ip}:{m.vm_port}",
        table="nat",
    )
    _ipt(
        "-D", "OUTPUT",
        "-d", m.pub_ip,
        "-p", m.protocol,
        "--dport", str(m.pub_port),
        "-j", "DNAT",
        "--to-destination", f"{m.vm_ip}:{m.vm_port}",
        table="nat",
    )


def _add_fwi(m: Mapping) -> bool:
    """Idempotently add LIBVIRT_FWI ACCEPT rule."""
    rc_check, _ = _ipt("-L", "LIBVIRT_FWI", "-n", table="filter", check=True)
    if rc_check != 0:
        log.debug("LIBVIRT_FWI chain not found — skipping FWI rule.")
        return True
    fwi_args = [
        "-d", f"{m.vm_ip}/32",
        "-i", LIBVIRT_IN_IFACE,
        "-o", LIBVIRT_OUT_IFACE,
        "-p", m.protocol,
        "-m", m.protocol,
        "--dport", str(m.vm_port),
        "-m", "comment",
        "--comment", m.fwd_comment(),
        "-j", "ACCEPT",
    ]
    if _ipt("-C", "LIBVIRT_FWI", *fwi_args, table="filter", check=True)[0] == 0:
        log.debug("LIBVIRT_FWI ACCEPT already exists for %s:%d", m.vm_ip, m.vm_port)
        return True
    rc, _ = _ipt("-A", "LIBVIRT_FWI", *fwi_args, table="filter")
    return rc == 0


def _del_fwi(m: Mapping) -> None:
    _ipt(
        "-D", "LIBVIRT_FWI",
        "-d", f"{m.vm_ip}/32",
        "-i", LIBVIRT_IN_IFACE,
        "-o", LIBVIRT_OUT_IFACE,
        "-p", m.protocol,
        "-m", m.protocol,
        "--dport", str(m.vm_port),
        "-m", "comment",
        "--comment", m.fwd_comment(),
        "-j", "ACCEPT",
        table="filter",
    )


def _add_ufw_forward(m: Mapping) -> bool:
    """Idempotently add ufw-user-forward ACCEPT rule."""
    rc_check, _ = _ipt("-L", "ufw-user-forward", "-n", table="filter", check=True)
    if rc_check != 0:
        log.debug("ufw-user-forward chain not found — skipping UFW forward rule.")
        return True
    fwd_args = [
        "-d", f"{m.vm_ip}/32",
        "-p", m.protocol,
        "-m", m.protocol,
        "--dport", str(m.vm_port),
        "-m", "comment",
        "--comment", m.fwd_comment(),
        "-j", "ACCEPT",
    ]
    if _ipt("-C", "ufw-user-forward", *fwd_args, table="filter", check=True)[0] == 0:
        return True
    rc, _ = _ipt("-A", "ufw-user-forward", *fwd_args, table="filter")
    return rc == 0


def _del_ufw_forward(m: Mapping) -> None:
    _ipt(
        "-D", "ufw-user-forward",
        "-d", f"{m.vm_ip}/32",
        "-p", m.protocol,
        "-m", m.protocol,
        "--dport", str(m.vm_port),
        "-m", "comment",
        "--comment", m.fwd_comment(),
        "-j", "ACCEPT",
        table="filter",
    )


def _add_ufw_input_allow(pub_port: int, protocol: str) -> bool:
    """Idempotently add ufw-user-input ACCEPT for a public port (inbound to hypervisor)."""
    rc_check, _ = _ipt("-L", "ufw-user-input", "-n", table="filter", check=True)
    if rc_check != 0:
        log.debug("ufw-user-input chain not found — skipping UFW input rule.")
        return True
    in_args = [
        "-p", protocol,
        "-m", protocol,
        "--dport", str(pub_port),
        "-m", "comment",
        "--comment", f"ghost-pm-input-{pub_port}",
        "-j", "ACCEPT",
    ]
    if _ipt("-C", "ufw-user-input", *in_args, table="filter", check=True)[0] == 0:
        return True
    rc, _ = _ipt("-A", "ufw-user-input", *in_args, table="filter")
    return rc == 0


def _del_ufw_input_allow(pub_port: int, protocol: str) -> None:
    """Remove ufw-user-input ACCEPT for a public port, only if no other mapping uses it."""
    rc_check, _ = _ipt("-L", "ufw-user-input", "-n", table="filter", check=True)
    if rc_check != 0:
        return
    still_used = any(
        m.pub_port == pub_port and m.protocol == protocol
        for m in _registry.mappings
    )
    if still_used:
        log.debug("Port %d/%s still in use — keeping ufw-user-input rule.", pub_port, protocol)
        return
    _ipt(
        "-D", "ufw-user-input",
        "-p", protocol,
        "-m", protocol,
        "--dport", str(pub_port),
        "-m", "comment",
        "--comment", f"ghost-pm-input-{pub_port}",
        "-j", "ACCEPT",
        table="filter",
    )


def _ensure_virbr0_masquerade() -> None:
    """
    Verify that virbr0 (192.168.122.0/24) has a MASQUERADE rule in POSTROUTING
    for return-traffic routing.  Libvirt normally manages this; we detect + repair
    if it's missing (e.g., after a power-off/iptables flush).
    """
    subnet = "192.168.122.0/24"
    for chain in ("LIBVIRT_PRT", "POSTROUTING"):
        rc, out = _ipt("-S", chain, table="nat", check=True)
        if rc == 0 and subnet in out and "MASQUERADE" in out:
            log.debug("virbr0 MASQUERADE already present in %s.", chain)
            return
    log.warning("virbr0 MASQUERADE for %s missing — adding to POSTROUTING.", subnet)
    _ipt("-A", "POSTROUTING", "-s", subnet, "!", "-d", subnet, "-j", "MASQUERADE", table="nat")


def _probe_connectivity(vm_ip: str, vm_port: int, protocol: str = "tcp") -> Optional[bool]:
    """
    TCP-connect to vm_ip:vm_port to verify the VM is reachable.
    Returns True (open), False (refused/timeout), or None for non-TCP protocols.
    """
    if protocol.lower() != "tcp":
        return None
    try:
        with socket.create_connection((vm_ip, vm_port), timeout=PROBE_TIMEOUT_S):
            return True
    except (ConnectionRefusedError, OSError):
        return False


def _persist_iptables() -> None:
    """Save iptables rules to /etc/iptables/rules.v4."""
    if DRY_RUN:
        log.info("[DRY_RUN] Would run iptables-save > %s", IPTABLES_RULES_FILE)
        return
    try:
        result = subprocess.run(
            ["iptables-save"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0:
            IPTABLES_RULES_FILE.write_text(result.stdout)
            log.info("iptables rules persisted to %s", IPTABLES_RULES_FILE)
        else:
            log.error("iptables-save failed: %s", result.stderr.strip())
    except Exception as exc:
        log.error("Failed to persist iptables: %s", exc)


# ── Public API — mapping management ─────────────────────────────────────────
def list_mappings() -> List[Dict]:
    return [asdict(m) for m in _registry.mappings]


def get_mapping(mapping_id: str) -> Optional[Dict]:
    for m in _registry.mappings:
        if m.id == mapping_id:
            return asdict(m)
    return None


def _find_conflict(pub_ip: str, pub_port: int, protocol: str, exclude_id: str = "") -> Optional[Mapping]:
    """Return the first registered mapping that occupies pub_ip:pub_port/proto."""
    for m in _registry.mappings:
        if m.id == exclude_id:
            continue
        if m.pub_ip == pub_ip and m.pub_port == pub_port and m.protocol == protocol:
            return m
    return None


def add_mapping(
    vm_name: str,
    vm_ip: str,
    vm_port: int,
    pub_ip: str,
    pub_port: int,
    protocol: str = "tcp",
    label: str = "",
    source: str = "manual",
) -> Tuple[bool, str, Optional[Dict]]:
    """
    Register and apply a port mapping.

    Returns (success, message, mapping_dict_or_None).
    """
    # Validate IPs
    try:
        ipaddress.ip_address(vm_ip)
        ipaddress.ip_address(pub_ip)
    except ValueError as exc:
        return False, f"Invalid IP address: {exc}", None

    # Validate ports
    if not (1 <= vm_port <= 65535) or not (1 <= pub_port <= 65535):
        return False, "Port must be in range 1–65535.", None

    # Conflict check
    conflict = _find_conflict(pub_ip, pub_port, protocol)
    if conflict:
        return (
            False,
            f"Conflict: {pub_ip}:{pub_port}/{protocol} is already mapped to "
            f"{conflict.vm_name} ({conflict.vm_ip}:{conflict.vm_port}) [id={conflict.id}].",
            asdict(conflict),
        )

    mapping = Mapping(
        id=str(uuid.uuid4())[:8],
        vm_name=vm_name,
        vm_ip=vm_ip,
        vm_port=vm_port,
        pub_ip=pub_ip,
        pub_port=pub_port,
        protocol=protocol,
        label=label or _label_for_port(vm_port),
        source=source,
    )

    ok_dnat = _add_nat_dnat(mapping)
    _add_fwi(mapping)
    _add_ufw_forward(mapping)
    _add_ufw_input_allow(pub_port, protocol)

    # Best-effort connectivity probe (non-fatal)
    probe = _probe_connectivity(vm_ip, vm_port, protocol)
    mapping.probe_ok   = probe
    mapping.last_probe = time.time() if probe is not None else 0.0

    mapping.applied = ok_dnat
    _registry.mappings.append(mapping)
    _registry.last_sync = time.time()
    _save_registry()

    if ok_dnat:
        _persist_iptables()

    probe_str = {True: " [VM reachable]", False: " [VM probe failed]", None: ""}.get(probe, "")
    status = "applied" if ok_dnat else "registered-only (iptables write failed)"
    msg = f"Mapping {mapping.id} {pub_ip}:{pub_port}/{protocol} → {vm_ip}:{vm_port} [{status}]{probe_str}"
    log.info(msg)
    return ok_dnat, msg, asdict(mapping)


def remove_mapping(mapping_id: str) -> Tuple[bool, str]:
    """Remove a mapping and tear down all its iptables rules."""
    target: Optional[Mapping] = None
    for m in _registry.mappings:
        if m.id == mapping_id:
            target = m
            break
    if target is None:
        return False, f"Mapping '{mapping_id}' not found."

    # Remove from registry first so _del_ufw_input_allow sees the updated count
    _registry.mappings = [m for m in _registry.mappings if m.id != mapping_id]

    _del_nat_dnat(target)
    _del_fwi(target)
    _del_ufw_forward(target)
    _del_ufw_input_allow(target.pub_port, target.protocol)

    _registry.last_sync = time.time()
    _save_registry()
    _persist_iptables()

    msg = (
        f"Mapping {mapping_id} ({target.pub_ip}:{target.pub_port}/{target.protocol} →"
        f" {target.vm_ip}:{target.vm_port}) removed."
    )
    log.info(msg)
    return True, msg


# ── AI suggestion engine ───────────────────────────────────────────────────────
def _label_for_port(port: int) -> str:
    for name, p in GHOST_SERVICE_PORTS.items():
        if p == port:
            return name
    return str(port)


def _next_available_pub_ip() -> Optional[str]:
    """
    Return the first public IP from the pool that has NO existing mapping.
    A pool IP is 'used' if ANY mapping uses it as pub_ip.
    """
    used_ips = {m.pub_ip for m in _registry.mappings}
    for ip in PUBLIC_IP_POOL:
        if ip not in used_ips:
            return ip
    return None


def _pub_ip_for_vm(vm_name: str) -> Optional[str]:
    """Return the pub_ip already assigned to a VM (any mapping), or None."""
    for m in _registry.mappings:
        if m.vm_name == vm_name and m.pub_ip in PUBLIC_IP_POOL:
            return m.pub_ip
    return None


def _next_overflow_port(pub_ip: str, protocol: str = "tcp") -> int:
    """Pick the next free port on pub_ip in the overflow range."""
    used = {m.pub_port for m in _registry.mappings if m.pub_ip == pub_ip and m.protocol == protocol}
    for port in range(OVERFLOW_PORT_MIN, OVERFLOW_PORT_MAX + 1):
        if port not in used:
            return port
    raise RuntimeError(f"No overflow ports available on {pub_ip} for {protocol}")


def suggest_mappings(
    vm_name: str,
    vm_ip: str,
    role: Optional[str] = None,
) -> Dict:
    """
    AI-generate recommended port mappings for a VM.

    Returns a dict with:
      role           — detected or provided role
      assigned_pub_ip — the public IP that will be used
      suggestions    — list of proposed Mapping-like dicts (not yet applied)
      conflicts      — list of suggested ports that have existing conflicts
      reasoning      — human-readable explanation
    """
    role = role or detect_role(vm_name)
    profile = _ROLE_PROFILES.get(role, _ROLE_PROFILES["generic"])

    # Pick pub IP: reuse VM's existing one, or get next free from pool
    pub_ip = _pub_ip_for_vm(vm_name)
    using_pool = False
    if pub_ip is None:
        pub_ip = _next_available_pub_ip()
        using_pool = pub_ip is not None

    # Fall back to overflow on hypervisor IP if pool exhausted
    overflow = pub_ip is None
    if overflow:
        pub_ip = HYPERVISOR_IP

    suggestions = []
    conflicts   = []

    for vm_port, label, proto in profile:
        if overflow:
            # On hypervisor IP: skip UDP (hairpin UDP DNAT is unreliable at scale)
            # and skip ports reserved for the hypervisor itself
            if proto == "udp":
                continue
            try:
                mapped_pub_port = _next_overflow_port(pub_ip, proto)
            except RuntimeError:
                continue
            if mapped_pub_port in RESERVED_HYPER_PORTS:
                continue
        else:
            # Dedicated IP: direct 1:1 port mapping
            mapped_pub_port = vm_port

        conflict = _find_conflict(pub_ip, mapped_pub_port, proto)
        if conflict:
            conflicts.append({
                "vm_port":    vm_port,
                "label":      label,
                "protocol":   proto,
                "pub_port":   mapped_pub_port,
                "blocked_by": conflict.vm_name,
                "blocked_id": conflict.id,
            })
            continue

        suggestions.append({
            "vm_name":  vm_name,
            "vm_ip":    vm_ip,
            "vm_port":  vm_port,
            "pub_ip":   pub_ip,
            "pub_port": mapped_pub_port,
            "protocol": proto,
            "label":    label,
            "source":   "ai-suggest",
        })

    # Build reasoning narrative
    if using_pool:
        ip_reason = f"Assigned dedicated public IP {pub_ip} from pool (next available)."
    elif overflow:
        ip_reason = (
            f"Public IP pool exhausted — using hypervisor overflow IP {pub_ip} "
            f"with port mapping (vm_port → high-port)."
        )
    else:
        ip_reason = f"Reusing existing public IP {pub_ip} already assigned to {vm_name}."

    reasoning = (
        f"Role detected: '{role}'. "
        + ip_reason
        + f" Generated {len(suggestions)} port suggestion(s)"
        + (f", {len(conflicts)} conflict(s) skipped." if conflicts else ".")
    )

    return {
        "vm_name":        vm_name,
        "vm_ip":          vm_ip,
        "role":           role,
        "assigned_pub_ip": pub_ip,
        "suggestions":    suggestions,
        "conflicts":      conflicts,
        "reasoning":      reasoning,
    }


def apply_suggestions(suggestions: List[Dict]) -> List[Dict]:
    """Apply a list of suggestion dicts (as returned by suggest_mappings)."""
    results = []
    for s in suggestions:
        ok, msg, mapping = add_mapping(
            vm_name=s["vm_name"],
            vm_ip=s["vm_ip"],
            vm_port=s["vm_port"],
            pub_ip=s["pub_ip"],
            pub_port=s["pub_port"],
            protocol=s.get("protocol", "tcp"),
            label=s.get("label", ""),
            source=s.get("source", "ai-suggest"),
        )
        results.append({"ok": ok, "message": msg, "mapping": mapping})
    return results


# ── Import from live iptables ─────────────────────────────────────────────────
_DNAT_RE = re.compile(
    r"-A PREROUTING -d (?P<pub_ip>[\d.]+)/32 -p (?P<proto>tcp|udp)"
    r".*?--dport (?P<pub_port>\d+)"
    r" -j DNAT --to-destination (?P<vm_ip>[\d.]+):(?P<vm_port>\d+)"
)


def import_from_iptables() -> int:
    """
    Parse existing iptables DNAT PREROUTING rules and register any that aren't
    already in the registry.  Returns the number of newly imported rules.
    """
    try:
        result = subprocess.run(
            ["iptables-save", "-t", "nat"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            log.error("iptables-save failed: %s", result.stderr)
            return 0
        raw = result.stdout
    except Exception as exc:
        log.error("Failed to read iptables NAT table: %s", exc)
        return 0

    # Build set of existing (pub_ip, pub_port, proto) tuples
    existing_keys = {(m.pub_ip, m.pub_port, m.protocol) for m in _registry.mappings}
    imported = 0

    for match in _DNAT_RE.finditer(raw):
        pub_ip   = match.group("pub_ip")
        proto    = match.group("proto")
        pub_port = int(match.group("pub_port"))
        vm_ip    = match.group("vm_ip")
        vm_port  = int(match.group("vm_port"))

        key = (pub_ip, pub_port, proto)
        if key in existing_keys:
            continue

        mapping = Mapping(
            id=str(uuid.uuid4())[:8],
            vm_name=_vm_name_for_ip(vm_ip),
            vm_ip=vm_ip,
            vm_port=vm_port,
            pub_ip=pub_ip,
            pub_port=pub_port,
            protocol=proto,
            label=_label_for_port(vm_port),
            applied=True,
            source="import",
        )
        _registry.mappings.append(mapping)
        existing_keys.add(key)
        imported += 1
        log.info("Imported rule: %s:%d → %s:%d (%s)", pub_ip, pub_port, vm_ip, vm_port, proto)

    if imported:
        _registry.last_import = time.time()
        _save_registry()

    log.info("iptables import complete: %d new rules imported.", imported)
    return imported


def _vm_name_for_ip(vm_ip: str) -> str:
    """Attempt to reverse-lookup a VM name from its IP via virsh leases."""
    try:
        result = subprocess.run(
            ["virsh", "--connect", VIRSH_URI, "net-dhcp-leases", "default"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        for line in result.stdout.splitlines():
            if vm_ip in line:
                parts = line.split()
                if len(parts) >= 6:
                    return parts[5]  # hostname column
    except Exception:
        pass
    return f"unknown@{vm_ip}"


# ── Orphan detection ──────────────────────────────────────────────────────────
def find_orphans() -> List[Dict]:
    """
    Return mappings whose vm_ip doesn't appear in any current DHCP lease.
    These may be stale rules from VMs that were deleted or have new IPs.
    """
    # Collect all currently active VM IPs from virsh leases
    active_ips: set[str] = set()
    try:
        result = subprocess.run(
            ["virsh", "--connect", VIRSH_URI, "net-dhcp-leases", "default"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            m = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})/\d+", line)
            if m:
                active_ips.add(m.group(1))
    except Exception as exc:
        log.warning("Could not query DHCP leases for orphan detection: %s", exc)
        return []

    orphans = []
    for mapping in _registry.mappings:
        if mapping.vm_ip not in active_ips:
            d = asdict(mapping)
            d["orphan_reason"] = f"vm_ip {mapping.vm_ip} not found in active DHCP leases"
            orphans.append(d)
    return orphans



def prune_orphans(auto_remove: bool = False) -> Dict:
    """
    Detect and optionally remove orphaned port mappings.
    If auto_remove=True, removes stale mappings + cleans iptables rules.
    If auto_remove=False (default), reports only without making changes.
    """
    orphans = find_orphans()
    removed: List[str] = []
    skipped: List[Any] = []
    if auto_remove:
        for o in orphans:
            ok, msg = remove_mapping(o["id"])
            if ok:
                removed.append(o["id"])
                log.info("Pruned orphan %s (%s:%s → %s:%s)",
                         o["id"], o["pub_ip"], o["pub_port"], o["vm_ip"], o["vm_port"])
            else:
                skipped.append({"id": o["id"], "error": msg})
    else:
        skipped = orphans
    return {
        "total_orphans": len(orphans),
        "removed":       removed,
        "skipped":       skipped,
        "auto_remove":   auto_remove,
        "ts":            time.time(),
    }


def add_all_for_vm(
    vm_name: str,
    vm_ip:   str,
    role:    Optional[str] = None,
    force:   bool = False,
) -> Dict:
    """
    AI-detect role and immediately apply the full port profile for a VM.
    force=True removes existing mappings first (useful after an IP change).
    Returns a summary with plan + per-rule results.
    """
    if force:
        old_ids = [m.id for m in _registry.mappings if m.vm_name == vm_name]
        for mid in old_ids:
            remove_mapping(mid)

    plan    = suggest_mappings(vm_name, vm_ip, role)
    results = apply_suggestions(plan["suggestions"])
    ok_count = sum(1 for r in results if r["ok"])
    return {
        "vm_name":   vm_name,
        "vm_ip":     vm_ip,
        "role":      plan["role"],
        "pub_ip":    plan["assigned_pub_ip"],
        "applied":   ok_count,
        "failed":    len(results) - ok_count,
        "conflicts": plan["conflicts"],
        "results":   results,
        "reasoning": plan["reasoning"],
        "ts":        time.time(),
    }


def add_range_mapping(
    vm_name:        str,
    vm_ip:          str,
    vm_port_start:  int,
    vm_port_end:    int,
    pub_ip:         str,
    pub_port_start: int,
    protocol:       str = "tcp",
    label:          str = "",
) -> Tuple[bool, str]:
    """
    Apply a port-range DNAT rule.
    pub_ip:pub_port_start–pub_port_end → vm_ip:vm_port_start–vm_port_end.
    Uses iptables multiport range syntax; range sizes must be equal.
    """
    range_size   = vm_port_end - vm_port_start
    pub_port_end = pub_port_start + range_size

    if range_size <= 0:
        return False, "vm_port_end must be greater than vm_port_start."
    if not (1 <= vm_port_start <= 65535 and vm_port_end <= 65535):
        return False, "VM port range must be within 1–65535."
    if not (1 <= pub_port_start <= 65535 and pub_port_end <= 65535):
        return False, "Public port range must be within 1–65535."

    for pub_port in range(pub_port_start, pub_port_end + 1):
        conflict = _find_conflict(pub_ip, pub_port, protocol)
        if conflict:
            return (
                False,
                f"Range conflict at {pub_ip}:{pub_port}/{protocol} — "
                f"already mapped to {conflict.vm_name} [id={conflict.id}].",
            )

    dnat_target = f"{vm_ip}:{vm_port_start}-{vm_port_end}"
    pre_args = [
        "-d", pub_ip,
        "-p", protocol,
        "--dport", f"{pub_port_start}:{pub_port_end}",
        "-j", "DNAT",
        "--to-destination", dnat_target,
    ]
    if DRY_RUN:
        log.info("[DRY_RUN] iptables -t nat -A PREROUTING %s", " ".join(pre_args))
        ok = True
    else:
        rc1, _ = _ipt("-A", "PREROUTING", *pre_args, table="nat")
        rc2, _ = _ipt("-A", "OUTPUT",     *pre_args, table="nat")
        ok = rc1 == 0

    if ok:
        range_label   = label or f"range-{vm_port_start}-{vm_port_end}"
        range_comment = f"ghost-pm-range-{pub_port_start}-{pub_port_end}"
        for offset in range(range_size + 1):
            mapping = Mapping(
                id=f"{str(uuid.uuid4())[:6]}r{offset}",
                vm_name=vm_name,
                vm_ip=vm_ip,
                vm_port=vm_port_start + offset,
                pub_ip=pub_ip,
                pub_port=pub_port_start + offset,
                protocol=protocol,
                label=range_label,
                applied=True,
                source="range",
                comment=range_comment,
            )
            _registry.mappings.append(mapping)
        _registry.last_sync = time.time()
        _save_registry()
        _persist_iptables()

    msg = (
        f"Range mapping {pub_ip}:{pub_port_start}-{pub_port_end} → "
        f"{vm_ip}:{vm_port_start}-{vm_port_end}/{protocol} "
        f"{'applied' if ok else 'FAILED'}."
    )
    log.info(msg)
    return ok, msg


def probe_mapping(mapping_id: str) -> Dict:
    """Re-probe a mapping's connectivity and persist the result."""
    m_data = get_mapping(mapping_id)
    if m_data is None:
        return {"error": f"Mapping '{mapping_id}' not found.", "mapping_id": mapping_id}
    probe = _probe_connectivity(m_data["vm_ip"], m_data["vm_port"], m_data["protocol"])
    for m in _registry.mappings:
        if m.id == mapping_id:
            m.probe_ok   = probe
            m.last_probe = time.time()
    _save_registry()
    return {
        "mapping_id": mapping_id,
        "vm_ip":      m_data["vm_ip"],
        "vm_port":    m_data["vm_port"],
        "protocol":   m_data["protocol"],
        "probe_ok":   probe,
        "ts":         time.time(),
    }


def mapping_stats(mapping_id: str) -> Optional[Dict]:
    """
    Read live iptables packet/byte counters for a mapping's PREROUTING DNAT rule.
    Returns {packets, bytes} or None if not found / permission denied.
    """
    m_data = get_mapping(mapping_id)
    if m_data is None:
        return None
    try:
        result = subprocess.run(
            ["iptables", "-t", "nat", "-L", "PREROUTING", "-n", "-v", "-x"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        needle = f"{m_data['vm_ip']}:{m_data['vm_port']}"
        for line in result.stdout.splitlines():
            if "DNAT" in line and needle in line and f"dpt:{m_data['pub_port']}" in line:
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        pkts = int(parts[0])
                        bts  = int(parts[1])
                        for mp in _registry.mappings:
                            if mp.id == mapping_id:
                                mp.hit_count = pkts
                        return {"packets": pkts, "bytes": bts, "mapping_id": mapping_id}
                    except ValueError:
                        pass
    except Exception as exc:
        log.debug("mapping_stats error: %s", exc)
    return None


# ── Public IP pool status ─────────────────────────────────────────────────────
def pool_status() -> Dict:
    """Return allocation status of the public IP pool."""
    used: Dict[str, List[str]] = {}   # pub_ip → list of vm_names
    for m in _registry.mappings:
        if m.pub_ip in PUBLIC_IP_POOL:
            used.setdefault(m.pub_ip, [])
            if m.vm_name not in used[m.pub_ip]:
                used[m.pub_ip].append(m.vm_name)

    pool = []
    for ip in PUBLIC_IP_POOL:
        pool.append({
            "ip":        ip,
            "allocated": ip in used,
            "vm_names":  used.get(ip, []),
            "port_count": sum(1 for m in _registry.mappings if m.pub_ip == ip),
        })

    overflow_count = sum(1 for m in _registry.mappings if m.pub_ip == HYPERVISOR_IP)
    return {
        "pool":           pool,
        "total":          len(PUBLIC_IP_POOL),
        "allocated":      len(used),
        "free":           len(PUBLIC_IP_POOL) - len(used),
        "hypervisor_ip":  HYPERVISOR_IP,
        "overflow_rules": overflow_count,
    }


# ── Sync loop (called periodically) ──────────────────────────────────────────
def sync_once() -> Dict:
    """
    Full sync: import new iptables rules, detect orphans.
    Returns a summary dict suitable for the /ports/sync REST endpoint.
    """
    imported = import_from_iptables()
    orphans  = find_orphans()
    _registry.last_sync = time.time()
    _save_registry()
    return {
        "imported": imported,
        "orphans":  len(orphans),
        "orphan_details": orphans,
        "ts": _registry.last_sync,
    }


# ── VM Lifecycle Watcher ──────────────────────────────────────────────────────

class VmLifecycleWatcher:
    """
    Background daemon thread that polls virsh for VM state transitions.
    When a VM transitions to "running", checks if port mappings exist.
    If PORT_AUTO_MAP_NEW_VMS=1, auto-applies the full role port profile.
    """

    def __init__(self) -> None:
        self._thread: Optional[threading.Thread] = None
        self._stop   = threading.Event()
        self._known:  Dict[str, str] = {}   # vm_name → last virsh state

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._watch_loop,
            name="vm-lifecycle-watcher",
            daemon=True,
        )
        self._thread.start()
        log.info("VM lifecycle watcher started (interval=%ds, auto_map=%s).",
                 VM_WATCH_INTERVAL_S, AUTO_MAP_NEW_VMS)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        log.info("VM lifecycle watcher stopped.")

    def _watch_loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._poll()
            except Exception as exc:
                log.warning("VM lifecycle watcher error: %s", exc)
            self._stop.wait(VM_WATCH_INTERVAL_S)

    def _poll(self) -> None:
        result = subprocess.run(
            ["virsh", "--connect", VIRSH_URI, "list", "--all"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return
        current: Dict[str, str] = {}
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("Id") or line.startswith("-"):
                continue
            parts = line.split(None, 2)
            if len(parts) >= 3:
                current[parts[1]] = " ".join(parts[2:]).strip()

        for vm_name, state in current.items():
            prev = self._known.get(vm_name, "")
            if prev != "running" and state == "running":
                log.info("VM lifecycle: '%s' transitioned to running.", vm_name)
                if AUTO_MAP_NEW_VMS:
                    self._auto_map(vm_name)
                else:
                    if not any(m.vm_name == vm_name for m in _registry.mappings):
                        log.info(
                            "VM '%s' running but has no port mappings. "
                            "Set PORT_AUTO_MAP_NEW_VMS=1 to auto-apply, "
                            "or POST /ports/vm/%s/map.",
                            vm_name, vm_name,
                        )
        self._known = current

    def _auto_map(self, vm_name: str) -> None:
        if any(m.vm_name == vm_name for m in _registry.mappings):
            log.debug("VM '%s' already has mappings — skipping auto-map.", vm_name)
            return
        result = subprocess.run(
            ["virsh", "--connect", VIRSH_URI, "domifaddr", vm_name],
            capture_output=True, text=True, timeout=10,
        )
        match = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", result.stdout)
        if not match or match.group(1).startswith("169."):
            log.warning("Cannot auto-map '%s': IP not yet assigned.", vm_name)
            return
        vm_ip = match.group(1)
        log.info("Auto-mapping ports for '%s' @ %s …", vm_name, vm_ip)
        summary = add_all_for_vm(vm_name, vm_ip)
        log.info(
            "Auto-map '%s': applied=%d failed=%d conflicts=%d",
            vm_name, summary["applied"], summary["failed"], len(summary["conflicts"]),
        )


_watcher: Optional[VmLifecycleWatcher] = None



# ── Module initialisation ─────────────────────────────────────────────────────
def init() -> None:
    """
    Load registry, import existing iptables rules, verify virbr0 MASQUERADE,
    and start the VM lifecycle watcher.  Call once at GAIS startup.
    """
    global _watcher
    _load_registry()
    if not _registry.mappings:
        log.info("Registry empty — importing existing iptables rules …")
        import_from_iptables()
    else:
        log.info("Port registry has %d entries — skipping full import.", len(_registry.mappings))

    _ensure_virbr0_masquerade()

    pool = pool_status()
    log.info(
        "Port manager ready. Pool: %d/%d IPs free, %d overflow rules on %s.",
        pool["free"], pool["total"],
        pool["overflow_rules"], HYPERVISOR_IP,
    )

    _watcher = VmLifecycleWatcher()
    _watcher.start()


def shutdown() -> None:
    """Gracefully stop background threads.  Call at GAIS shutdown."""
    global _watcher
    if _watcher:
        _watcher.stop()
        _watcher = None
