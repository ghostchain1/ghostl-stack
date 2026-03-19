#!/usr/bin/env python3
"""
GhostChain Autonomous Network Manager (GANM) v1.1
===================================================
AI-powered port manager and network health daemon.
Starts at system boot via systemd. Integrates deeply with
GhostBrain Core for AI-guided eviction decisions, anomaly detection,
predictive failure analysis, and routing-law enforcement.

Architecture:
  - boot_scan()          — runs synchronously before async event loops
  - _probe_loop()        — periodic RPC/HTTP/TCP probes + GhostBrain chain health sync
  - _conflict_loop()     — scans for stray PIDs; evictions through GhostBrain action planner
  - _ghostbrain_loop()   — registers agent; polls anomalies, alerts, recommendations
  - _routing_law_loop()  — detects L3→L1 bypass risk; forwards to signing relay + GhostBrain
  - Metrics server       — :9109/metrics (Prometheus)
  - Status API           — :9110/status  (JSON)

Routing law: L3 (903) -> L2 (901) -> L1 (14000101) — never L3->L1 directly.

Environment:
  GHOSTBRAIN_URL               http://localhost:7900
  SIGNING_RELAY_URL            http://localhost:7910
  CONTROL_PLANE_HMAC_SECRET    required in production
  GANM_AGENT_ID                ghost-autonomous-network-manager
  PROBE_INTERVAL_S             15
  CONFLICT_INTERVAL_S          10
  GHOSTBRAIN_POLL_INTERVAL_S   30
  METRICS_PORT                 9109
  DRY_RUN                      0
  LOG_LEVEL                    INFO
  AI_SCORE_THRESHOLD           0.6
  EVICTION_NEEDS_PLAN          1
"""

import asyncio
import json
import logging
import os
import re
import signal
import socket
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Dict, List, Optional, Tuple

import ghostbrain_client as gb

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [GANM] %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("ganm")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROBE_INTERVAL_S           = int(os.environ.get("PROBE_INTERVAL_S",           "15"))
CONFLICT_INTERVAL_S        = int(os.environ.get("CONFLICT_INTERVAL_S",        "10"))
GHOSTBRAIN_POLL_INTERVAL_S = int(os.environ.get("GHOSTBRAIN_POLL_INTERVAL_S", "30"))
METRICS_PORT               = int(os.environ.get("METRICS_PORT",               "9109"))
DRY_RUN                    = os.environ.get("DRY_RUN", "0") == "1"
AI_SCORE_THRESHOLD         = float(os.environ.get("AI_SCORE_THRESHOLD", "0.6"))
EVICTION_NEEDS_PLAN        = os.environ.get("EVICTION_NEEDS_PLAN", "1") == "1"

# ---------------------------------------------------------------------------
# Canonical port registry
# ---------------------------------------------------------------------------
@dataclass
class PortSpec:
    port:       int
    service:    str
    layer:      str
    proto:      str
    rpc_probe:  bool
    http_probe: bool
    evict_auto: bool
    chain_id:   Optional[int] = None

PORT_REGISTRY: List[PortSpec] = [
    PortSpec(18545, "ghostchaind/L1-rpc",      "L1",    "tcp", True,  False, True,  14000101),
    PortSpec(29547, "ghostl2/rpc",             "L2",    "tcp", True,  False, True,  901),
    PortSpec(39545, "ghostl3/rpc",             "L3",    "tcp", True,  False, True,  903),
    PortSpec(1317,  "cosmos-lcd",              "L1",    "tcp", False, True,  False),
    PortSpec(26657, "cometbft-rpc",            "L1",    "tcp", False, True,  False),
    PortSpec(9090,  "cosmos-grpc",             "L1",    "tcp", False, False, False),
    PortSpec(7900,  "ghostbrain-core",         "ai",    "tcp", False, True,  True),
    PortSpec(7910,  "signing-relay",           "ai",    "tcp", False, True,  False),
    PortSpec(4060,  "ghostnet-controller",     "infra", "tcp", False, True,  True),
    PortSpec(7681,  "l3-fee-collector",        "L3",    "tcp", False, True,  True),
    PortSpec(7682,  "l2-revenue-aggregator",   "L2",    "tcp", False, True,  True),
    PortSpec(7683,  "treasury-engine",         "infra", "tcp", False, True,  True),
    PortSpec(7684,  "reward-distributor",      "infra", "tcp", False, True,  True),
    PortSpec(7685,  "sovereign-governor",      "infra", "tcp", False, True,  True),
    PortSpec(7766,  "network-manager-service", "infra", "tcp", False, True,  True),
    PortSpec(7612,  "chain-status-service",    "infra", "tcp", False, True,  True),
    PortSpec(7613,  "node-health-service",     "infra", "tcp", False, True,  True),
    PortSpec(8090,  "compliance-service",      "infra", "tcp", False, True,  False),
    PortSpec(9100,  "gais-rest-api",           "infra", "tcp", False, True,  True),
    PortSpec(9108,  "hypervisor-metrics",      "infra", "tcp", False, True,  True),
    PortSpec(9109,  "ganm-metrics",            "infra", "tcp", False, True,  False),
    PortSpec(9091,  "prometheus",              "infra", "tcp", False, True,  False),
    PortSpec(3000,  "grafana",                 "infra", "tcp", False, True,  False),
    PortSpec(5432,  "postgres",                "infra", "tcp", False, False, False),
    PortSpec(5433,  "postgres-gns",            "infra", "tcp", False, False, False),
    PortSpec(6379,  "redis",                   "infra", "tcp", False, False, False),
    PortSpec(6380,  "redis-gas-engine",        "infra", "tcp", False, False, False),
]

PORT_MAP: Dict[int, PortSpec] = {p.port: p for p in PORT_REGISTRY}

PROCESS_ALLOWLIST = [
    "ghostchaind", "ghost-exec", "ghost-sequencer", "ghost-deriver", "ghost-settlement", "ghost-bridge", "ghost-proof",
    "ghostbrain", "node", "python3", "ghost-",
    "postgres", "redis-server", "grafana", "prometheus",
    "docker-proxy",
]

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
class PortStatus(str, Enum):
    HEALTHY  = "healthy"
    DEGRADED = "degraded"
    CONFLICT = "conflict"
    DOWN     = "down"
    UNKNOWN  = "unknown"

@dataclass
class PortState:
    port:           int
    status:         PortStatus      = PortStatus.UNKNOWN
    pid:            Optional[int]   = None
    process_name:   Optional[str]   = None
    latency_ms:     Optional[float] = None
    last_checked:   float           = field(default_factory=time.time)
    block_number:   Optional[int]   = None
    error:          Optional[str]   = None
    ai_risk_score:  float           = 0.0
    eviction_count: int             = 0
    plan_id:        Optional[str]   = None

_state: Dict[int, PortState] = {p.port: PortState(p.port) for p in PORT_REGISTRY}
_running       = True
_boot_complete = False
_gb_alive      = False

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------
def _metrics_text() -> str:
    lines = [
        "# HELP ganm_port_up 1 if port is healthy\n# TYPE ganm_port_up gauge",
        "# HELP ganm_port_latency_ms RPC probe latency in ms\n# TYPE ganm_port_latency_ms gauge",
        "# HELP ganm_port_conflict 1 if port has a stray process\n# TYPE ganm_port_conflict gauge",
        "# HELP ganm_ai_risk_score AI risk score 0-1\n# TYPE ganm_ai_risk_score gauge",
        "# HELP ganm_eviction_total Cumulative evictions\n# TYPE ganm_eviction_total counter",
        "# HELP ganm_boot_complete 1 once boot scan is done\n# TYPE ganm_boot_complete gauge",
        "# HELP ganm_ghostbrain_alive 1 if GhostBrain Core reachable\n# TYPE ganm_ghostbrain_alive gauge",
    ]
    for port, st in _state.items():
        spec = PORT_MAP.get(port)
        svc = spec.service if spec else "unknown"
        lyr = spec.layer   if spec else "?"
        lbl = f'port="{port}",service="{svc}",layer="{lyr}"'
        lines.append(f'ganm_port_up{{{lbl}}} {1 if st.status == PortStatus.HEALTHY else 0}')
        if st.latency_ms is not None:
            lines.append(f'ganm_port_latency_ms{{{lbl}}} {st.latency_ms:.2f}')
        lines.append(f'ganm_port_conflict{{{lbl}}} {1 if st.status == PortStatus.CONFLICT else 0}')
        lines.append(f'ganm_ai_risk_score{{{lbl}}} {st.ai_risk_score:.4f}')
        lines.append(f'ganm_eviction_total{{{lbl}}} {st.eviction_count}')
    lines.append(f'ganm_boot_complete{{}} {1 if _boot_complete else 0}')
    lines.append(f'ganm_ghostbrain_alive{{}} {1 if _gb_alive else 0}')
    return "\n".join(lines) + "\n"

class _MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/metrics", "/"):
            body = _metrics_text().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *_): pass

def _start_metrics_server():
    srv = HTTPServer(("0.0.0.0", METRICS_PORT), _MetricsHandler)
    log.info("Prometheus metrics: http://0.0.0.0:%d/metrics", METRICS_PORT)
    Thread(target=srv.serve_forever, daemon=True).start()

# ---------------------------------------------------------------------------
# Status API
# ---------------------------------------------------------------------------
class _StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/status":
            body = json.dumps({
                str(p): {
                    "service":      PORT_MAP[p].service,
                    "layer":        PORT_MAP[p].layer,
                    "status":       s.status.value,
                    "latency_ms":   s.latency_ms,
                    "block":        s.block_number,
                    "ai_risk":      round(s.ai_risk_score, 4),
                    "evictions":    s.eviction_count,
                    "last_checked": s.last_checked,
                    "plan_id":      s.plan_id,
                }
                for p, s in _state.items()
            }, indent=2).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/health":
            body = json.dumps({
                "ok":            True,
                "boot_complete": _boot_complete,
                "ghostbrain_up": _gb_alive,
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *_): pass

def _start_status_server():
    port = METRICS_PORT + 1
    srv = HTTPServer(("0.0.0.0", port), _StatusHandler)
    log.info("Status API: http://0.0.0.0:%d/status", port)
    Thread(target=srv.serve_forever, daemon=True).start()

# ---------------------------------------------------------------------------
# Port scanning
# ---------------------------------------------------------------------------
def _scan_listening_ports() -> Dict[int, Tuple[Optional[int], Optional[str]]]:
    result: Dict[int, Tuple[Optional[int], Optional[str]]] = {}
    try:
        proc = subprocess.run(
            ["ss", "-tlnp"],
            capture_output=True, text=True, timeout=10
        )
        for line in proc.stdout.splitlines():
            m = re.search(r":(\d+)\s", line)
            if not m:
                continue
            port = int(m.group(1))
            pid_m  = re.search(r'pid=(\d+)', line)
            name_m = re.search(r'\(\("([^"]+)"', line)
            result[port] = (
                int(pid_m.group(1)) if pid_m else None,
                name_m.group(1)     if name_m else None,
            )
    except Exception as exc:
        log.warning("ss scan failed: %s", exc)
    return result

def _process_allowed(name: Optional[str]) -> bool:
    if not name:
        return False
    nl = name.lower()
    return any(a in nl for a in PROCESS_ALLOWLIST)

# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------
def _tcp_probe(port: int, timeout: float = 3.0) -> Tuple[bool, float]:
    t0 = time.monotonic()
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True, (time.monotonic() - t0) * 1000
    except Exception:
        return False, 0.0

def _rpc_probe(port: int) -> Tuple[bool, float, Optional[int]]:
    import urllib.request as _ur
    payload = json.dumps(
        {"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 1}
    ).encode()
    t0 = time.monotonic()
    try:
        req = _ur.Request(
            f"http://127.0.0.1:{port}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _ur.urlopen(req, timeout=5) as r:
            body = json.loads(r.read())
            latency = (time.monotonic() - t0) * 1000
            block = int(body.get("result", "0x0"), 16) if body.get("result") else None
            return True, latency, block
    except Exception:
        return False, (time.monotonic() - t0) * 1000, None

def _http_probe(port: int) -> Tuple[bool, float]:
    import urllib.request as _ur
    import urllib.error as _ue
    for path in ("/health", "/healthz", "/"):
        t0 = time.monotonic()
        try:
            with _ur.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
                r.read()
                return True, (time.monotonic() - t0) * 1000
        except _ue.HTTPError as e:
            if e.code < 500:
                return True, (time.monotonic() - t0) * 1000
        except Exception:
            pass
    return False, 0.0

def _run_probe(spec: PortSpec, st: PortState):
    """Run the appropriate probe for spec and update st in place."""
    prev = st.status
    if spec.rpc_probe:
        ok, latency, block = _rpc_probe(spec.port)
        st.latency_ms   = latency
        st.block_number = block
        st.status       = PortStatus.HEALTHY if ok else PortStatus.DEGRADED
        st.error        = None if ok else "rpc_probe_failed"
        if prev != st.status:
            log.info("port=%d status %s->%s", spec.port, prev.value, st.status.value)
            if not ok and _gb_alive:
                gb.think_port_event(
                    "chain_rpc_down" if st.status == PortStatus.DOWN else "chain_rpc_degraded",
                    spec.port, spec.service, spec.layer,
                    {"latencyMs": latency, "chainId": spec.chain_id},
                )
    elif spec.http_probe:
        ok, latency = _http_probe(spec.port)
        st.latency_ms = latency
        st.status     = PortStatus.HEALTHY if ok else PortStatus.DEGRADED
        st.error      = None if ok else "http_probe_failed"
        if prev != st.status:
            log.info("port=%d status %s->%s", spec.port, prev.value, st.status.value)
    else:
        ok, latency = _tcp_probe(spec.port)
        st.latency_ms = latency
        if st.status not in (PortStatus.CONFLICT,):
            st.status = PortStatus.HEALTHY if ok else PortStatus.DOWN
    st.last_checked = time.time()

# ---------------------------------------------------------------------------
# Eviction (with GhostBrain action plan gate)
# ---------------------------------------------------------------------------
def _evict_stray(spec: PortSpec, st: PortState, pid: int, pname: Optional[str]) -> bool:
    """
    Evict a stray process. If EVICTION_NEEDS_PLAN=1 and GhostBrain is reachable,
    routes through the action planner before executing kill.
    """
    if DRY_RUN:
        log.warning("[DRY_RUN] Would evict pid=%d (%s) on port %d", pid, pname, spec.port)
        return False

    if EVICTION_NEEDS_PLAN and _gb_alive:
        approved, plan_id = gb.plan_eviction(
            spec.port, spec.service, pid, pname or "", st.ai_risk_score
        )
        if not approved:
            log.info("Eviction blocked by GhostBrain planner: port=%d pid=%d", spec.port, pid)
            return False
        st.plan_id = plan_id
        if plan_id:
            gb.commit_plan(plan_id)

    log.warning("Evicting stray pid=%d (%s) on reserved port %d (risk=%.2f)",
                pid, pname, spec.port, st.ai_risk_score)
    try:
        subprocess.run(["kill", "-TERM", str(pid)], capture_output=True, timeout=5)
        st.eviction_count += 1
        st.plan_id = None
        if _gb_alive:
            gb.send_conflict_signal(spec.port, spec.service, pid, pname or "", st.ai_risk_score)
        return True
    except Exception as exc:
        log.error("eviction failed pid=%d: %s", pid, exc)
        return False

# ---------------------------------------------------------------------------
# Boot scan
# ---------------------------------------------------------------------------
def boot_scan():
    global _boot_complete, _gb_alive
    log.info("=== GANM boot scan started (DRY_RUN=%s) ===", DRY_RUN)

    _gb_alive = gb.is_alive()
    log.info("GhostBrain Core reachable: %s", _gb_alive)
    if _gb_alive:
        gb.register_agent()

    listening = _scan_listening_ports()

    for spec in PORT_REGISTRY:
        st = _state[spec.port]
        pid, pname = listening.get(spec.port, (None, None))
        st.pid          = pid
        st.process_name = pname

        if pid is None or _process_allowed(pname):
            _run_probe(spec, st)
        else:
            st.status = PortStatus.CONFLICT
            st.ai_risk_score = (
                gb.score_port_health(
                    spec.port, spec.service, spec.layer,
                    "conflict", None, "stray_process",
                ) if _gb_alive else 0.8
            )
            log.warning(
                "Port conflict: port=%d service=%s stray_pid=%d stray=%s risk=%.2f",
                spec.port, spec.service, pid, pname, st.ai_risk_score,
            )
            if spec.evict_auto and st.ai_risk_score >= AI_SCORE_THRESHOLD:
                _evict_stray(spec, st, pid, pname)

        if _gb_alive:
            gb.send_port_health_signal(
                spec.port, spec.service, spec.layer,
                st.status.value, st.latency_ms, st.error, st.block_number, spec.chain_id,
            )

        log.info("boot: port=%-6d layer=%-5s status=%-10s service=%s",
                 spec.port, spec.layer, st.status.value, spec.service)

    _boot_complete = True
    h  = sum(1 for s in _state.values() if s.status == PortStatus.HEALTHY)
    dn = sum(1 for s in _state.values() if s.status == PortStatus.DOWN)
    c  = sum(1 for s in _state.values() if s.status == PortStatus.CONFLICT)
    log.info("=== boot scan complete: healthy=%d down=%d conflict=%d gb_alive=%s ===",
             h, dn, c, _gb_alive)

# ---------------------------------------------------------------------------
# Probe loop
# ---------------------------------------------------------------------------
async def _probe_loop():
    global _gb_alive
    log.info("Probe loop started (interval=%ds)", PROBE_INTERVAL_S)
    while _running:
        await asyncio.sleep(PROBE_INTERVAL_S)
        if not _running:
            break

        _gb_alive = gb.is_alive(timeout=2.0)

        for spec in PORT_REGISTRY:
            st = _state[spec.port]
            try:
                _run_probe(spec, st)
                if _gb_alive and st.status in (PortStatus.DEGRADED, PortStatus.DOWN):
                    st.ai_risk_score = gb.score_port_health(
                        spec.port, spec.service, spec.layer,
                        st.status.value, st.latency_ms, st.error,
                    )
                    gb.send_port_health_signal(
                        spec.port, spec.service, spec.layer,
                        st.status.value, st.latency_ms, st.error,
                        st.block_number, spec.chain_id,
                    )
            except Exception as exc:
                log.debug("probe error port=%d: %s", spec.port, exc)

        if _gb_alive:
            gb.send_probe_cycle_summary({p: s.status.value for p, s in _state.items()})
            # Authoritative chain health override
            chain_health = gb.get_chain_health()
            _port_for_layer = {"l1": 18545, "l2": 29547, "l3": 39545}
            for layer, ok in chain_health.items():
                port = _port_for_layer.get(layer.lower())
                if port and port in _state:
                    if _state[port].status == PortStatus.HEALTHY and not ok:
                        log.warning(
                            "GhostBrain: %s chain unhealthy — overriding local status",
                            layer.upper(),
                        )
                        _state[port].status = PortStatus.DEGRADED

# ---------------------------------------------------------------------------
# Conflict loop
# ---------------------------------------------------------------------------
async def _conflict_loop():
    log.info("Conflict scan loop started (interval=%ds)", CONFLICT_INTERVAL_S)
    await asyncio.sleep(CONFLICT_INTERVAL_S // 2)
    while _running:
        listening = _scan_listening_ports()
        for spec in PORT_REGISTRY:
            if not spec.evict_auto:
                continue
            st = _state[spec.port]
            pid, pname = listening.get(spec.port, (None, None))
            st.pid = pid
            st.process_name = pname

            if pid is not None and not _process_allowed(pname):
                if st.status != PortStatus.CONFLICT:
                    log.warning("New conflict: port=%d stray_pid=%d process=%s",
                                spec.port, pid, pname)
                    if _gb_alive:
                        gb.think_port_event(
                            "port_conflict", spec.port, spec.service, spec.layer,
                            {"strayPid": pid, "strayProcess": pname or ""},
                        )
                st.status = PortStatus.CONFLICT
                st.ai_risk_score = (
                    gb.score_port_health(
                        spec.port, spec.service, spec.layer,
                        "conflict", None, "stray_process",
                    ) if _gb_alive else 0.8
                )
                if st.ai_risk_score >= AI_SCORE_THRESHOLD:
                    _evict_stray(spec, st, pid, pname)
            elif pid is None and st.status == PortStatus.CONFLICT:
                _run_probe(spec, st)

        await asyncio.sleep(CONFLICT_INTERVAL_S)

# ---------------------------------------------------------------------------
# GhostBrain integration loop
# ---------------------------------------------------------------------------
async def _ghostbrain_loop():
    """
    Periodically:
      - Re-registers after GhostBrain restarts
      - Polls anomaly events -> marks degraded ports
      - Polls failure predictions for chain RPC resources
      - Syncs active alerts (logs critical / emergency)
      - Pulls load-balancer recommendations
      - Syncs GhostBrain RPC node status into local state
    """
    global _gb_alive
    log.info("GhostBrain integration loop started (interval=%ds)", GHOSTBRAIN_POLL_INTERVAL_S)
    _registered = False
    await asyncio.sleep(5)

    while _running:
        if not _gb_alive:
            await asyncio.sleep(GHOSTBRAIN_POLL_INTERVAL_S)
            continue

        # Re-register if GhostBrain just came up
        if not _registered:
            if gb.register_agent():
                _registered = True

        # --- Anomaly events per chain port ---
        for spec in PORT_REGISTRY:
            if spec.layer not in ("L1", "L2", "L3"):
                continue
            anomalies = gb.get_anomalies(f"port:{spec.port}:{spec.service}")
            for anomaly in anomalies[:3]:
                sev    = anomaly.get("severity", "?")
                metric = anomaly.get("metric", "?")
                z      = anomaly.get("zScore", 0)
                log.warning(
                    "GhostBrain anomaly: port=%d service=%s metric=%s severity=%s z=%.2f",
                    spec.port, spec.service, metric, sev, z,
                )
                if sev in ("high", "critical") and not anomaly.get("resolved"):
                    st = _state[spec.port]
                    if st.status == PortStatus.HEALTHY:
                        st.status = PortStatus.DEGRADED
                        log.warning("port=%d marked DEGRADED by anomaly (z=%.2f)", spec.port, z)

        # --- Failure predictions for chain RPCs ---
        for port in (18545, 29547, 39545):
            spec = PORT_MAP.get(port)
            if not spec:
                continue
            preds = gb.get_failure_predictions(
                f"port:{port}:{spec.service}", min_risk="elevated"
            )
            for pred in preds[:2]:
                risk  = pred.get("risk", "?")
                score = pred.get("score", 0)
                log.warning(
                    "GhostBrain failure prediction: port=%d service=%s risk=%s score=%.2f",
                    port, spec.service, risk, score,
                )
                if risk in ("high", "imminent"):
                    _state[port].ai_risk_score = max(_state[port].ai_risk_score, float(score))

        # --- Active alerts ---
        for alert in gb.get_active_alerts():
            if alert.get("severity") in ("crit", "emergency"):
                log.error(
                    "GhostBrain ALERT [%s] %s: %s",
                    alert.get("severity"), alert.get("rule"), alert.get("message"),
                )

        # --- Load-balancer recommendations ---
        for rec in gb.get_recommendations()[:5]:
            log.info("GhostBrain recommendation: %s", rec)

        # --- RPC node status sync ---
        for node in gb.get_rpc_node_statuses():
            node_id = node.get("id", "")
            port = {"l1-rpc": 18545, "l2-rpc": 29547, "l3-rpc": 39545}.get(node_id)
            if port and port in _state:
                if not node.get("online", True) and _state[port].status == PortStatus.HEALTHY:
                    log.warning(
                        "GhostBrain RPC node=%s offline -> marking port %d DEGRADED",
                        node_id, port,
                    )
                    _state[port].status = PortStatus.DEGRADED
                if node.get("latencyMs") is not None:
                    _state[port].latency_ms = float(node["latencyMs"])

        await asyncio.sleep(GHOSTBRAIN_POLL_INTERVAL_S)

# ---------------------------------------------------------------------------
# Routing law loop
# ---------------------------------------------------------------------------
async def _routing_law_loop():
    await asyncio.sleep(30)
    log.info("Routing law monitor started (cadence=60s)")
    while _running:
        l1 = _state.get(18545)
        l2 = _state.get(29547)
        l3 = _state.get(39545)
        if (l1 and l3
                and l1.status == PortStatus.HEALTHY
                and l3.status == PortStatus.HEALTHY
                and l2 and l2.status != PortStatus.HEALTHY):
            msg = (
                f"L2 is {l2.status.value} while L1+L3 are healthy "
                "— potential L3->L1 bypass risk"
            )
            log.error("ROUTING LAW VIOLATION: %s", msg)
            if _gb_alive:
                gb.send_routing_law_violation(
                    msg,
                    l1.status.value, l2.status.value, l3.status.value,
                )
            gb.notify_signing_relay({
                "type":      "routing_law_violation",
                "severity":  "critical",
                "detail":    msg,
                "l1_status": l1.status.value,
                "l2_status": l2.status.value,
                "l3_status": l3.status.value,
            })
        await asyncio.sleep(60)

# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------
def _handle_signal(signum, _frame):
    global _running
    log.info("Received signal %d — shutting down", signum)
    _running = False

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def _main_loop():
    await asyncio.gather(
        _probe_loop(),
        _conflict_loop(),
        _ghostbrain_loop(),
        _routing_law_loop(),
    )

def main():
    global _running
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT,  _handle_signal)

    log.info("GhostChain Autonomous Network Manager (GANM) v1.1 starting")
    log.info(
        "Config — DRY_RUN=%s  GB=%s  PROBE=%ds  CONFLICT=%ds  "
        "GB_POLL=%ds  EVICTION_PLAN=%s  AI_THRESHOLD=%.2f",
        DRY_RUN, gb.GHOSTBRAIN_URL,
        PROBE_INTERVAL_S, CONFLICT_INTERVAL_S, GHOSTBRAIN_POLL_INTERVAL_S,
        EVICTION_NEEDS_PLAN, AI_SCORE_THRESHOLD,
    )

    _start_metrics_server()
    _start_status_server()
    boot_scan()

    try:
        asyncio.run(_main_loop())
    except KeyboardInterrupt:
        _running = False

    log.info("GANM stopped.")

if __name__ == "__main__":
    main()
