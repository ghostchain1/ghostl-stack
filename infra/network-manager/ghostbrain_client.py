"""
GhostBrain Core Client — GANM Integration Module
=================================================
Handles all communication between the Autonomous Network Manager and
GhostBrain Core (http://localhost:7900).

API surface used:
  POST  /api/v1/agents/register       — register GANM as a named agent
  POST  /api/v1/signals               — send port health / anomaly signals
  POST  /api/v1/rpc/decide            — AI scoring for RPC endpoint selection
  POST  /ai/think                     — full 6-phase cognitive cycle (per event)
  POST  /actions/plan                 — submit eviction plans for governance review
  POST  /actions/commit               — commit approved plans to queue
  GET   /api/v1/brain/blockchain/health — per-layer boolean health
  GET   /api/v1/brain/rpc/status      — all 3 RPC node statuses
  GET   /api/v1/predictive/anomalies  — z-score anomaly events
  GET   /api/v1/predictive/failures   — failure predictions (0-1 score)
  GET   /api/v1/predictive/recommendations — load-balancer recommendations
  GET   /api/v1/observability/alerts  — active + historical alerts
  GET   /healthz                      — liveness probe (no auth)

Auth:
  Bearer token: Authorization: Bearer <CONTROL_PLANE_HMAC_SECRET>
  If secret not set, falls back to unauthenticated (dev mode only).

Security: no shell=True, no external package deps (stdlib only).
"""

import hashlib
import hmac as _hmac
import json
import logging
import os
import time
import uuid
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("ganm.gb")

# ---------------------------------------------------------------------------
# Config (read from environment)
# ---------------------------------------------------------------------------
GHOSTBRAIN_URL    = os.environ.get("GHOSTBRAIN_URL",    "http://localhost:7900")
SIGNING_RELAY_URL = os.environ.get("SIGNING_RELAY_URL", "http://localhost:7910")
HMAC_SECRET       = os.environ.get("CONTROL_PLANE_HMAC_SECRET", "")
AGENT_ID          = os.environ.get("GANM_AGENT_ID", "ghost-autonomous-network-manager")
HTTP_TIMEOUT      = float(os.environ.get("GHOSTBRAIN_HTTP_TIMEOUT", "5"))

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def _auth_headers(body: bytes) -> Dict[str, str]:
    """
    Returns Authorization headers for a request body.
    Prefers bearer (simple) but also sets HMAC-SHA256 headers so both
    validation paths in GhostBrain Core succeed simultaneously.
    """
    headers: Dict[str, str] = {
        "Content-Type": "application/json",
        "X-Agent-Id": AGENT_ID,
    }
    if not HMAC_SECRET:
        return headers  # dev fallback: no auth

    # Bearer for the simple path
    headers["Authorization"] = f"Bearer {HMAC_SECRET}"

    # HMAC-SHA256 for the strict path
    ts = str(int(time.time() * 1000))
    sig = _hmac.new(
        HMAC_SECRET.encode(),
        f"{ts}:{body.decode(errors='replace')}".encode(),
        hashlib.sha256,
    ).hexdigest()
    headers["X-HMAC-Timestamp"] = ts
    headers["X-HMAC-Signature"]  = sig
    return headers

# ---------------------------------------------------------------------------
# Low-level HTTP helper
# ---------------------------------------------------------------------------
def _post(path: str, payload: Any, timeout: float = HTTP_TIMEOUT) -> Optional[Dict]:
    body = json.dumps(payload).encode()
    try:
        req = urllib.request.Request(
            f"{GHOSTBRAIN_URL}{path}",
            data=body,
            headers=_auth_headers(body),
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        log.debug("GhostBrain POST %s → %d %s", path, exc.code, exc.read()[:200])
    except Exception as exc:
        log.debug("GhostBrain POST %s failed: %s", path, exc)
    return None

def _get(path: str, timeout: float = HTTP_TIMEOUT) -> Optional[Any]:
    try:
        req = urllib.request.Request(
            f"{GHOSTBRAIN_URL}{path}",
            headers=_auth_headers(b""),
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as exc:
        log.debug("GhostBrain GET %s failed: %s", path, exc)
    return None

# ---------------------------------------------------------------------------
# Liveness check
# ---------------------------------------------------------------------------
def is_alive(timeout: float = 2.0) -> bool:
    """Quick liveness probe — no auth required."""
    try:
        req = urllib.request.Request(f"{GHOSTBRAIN_URL}/healthz", method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read())
            return body.get("status") == "ok"
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Agent registration
# ---------------------------------------------------------------------------
def register_agent() -> bool:
    """
    Register GANM as a named agent in GhostBrain.
    Returns True on success or if already registered.
    """
    result = _post("/api/v1/agents/register", {
        "agentId":      AGENT_ID,
        "name":         "GhostChain Autonomous Network Manager",
        "version":      "1.0.0",
        "capabilities": [
            "port_health_monitoring",
            "conflict_detection",
            "stray_process_eviction",
            "routing_law_enforcement",
            "rpc_probe",
        ],
        "layer":        "infra",
        "registeredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    if result:
        log.info("GANM registered with GhostBrain: %s", AGENT_ID)
        return True
    log.warning("GhostBrain agent registration failed (will retry)")
    return False

# ---------------------------------------------------------------------------
# Signal bus
# ---------------------------------------------------------------------------
def _message_envelope(subject: str, payload: Any) -> Dict:
    return {
        "messageId":     str(uuid.uuid4()),
        "subject":       subject,
        "correlationId": str(uuid.uuid4()),
        "senderAgentId": AGENT_ID,
        "payload":       payload,
        "sentAt":        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

def send_port_health_signal(port: int, service: str, layer: str,
                             status: str, latency_ms: Optional[float],
                             error: Optional[str], block_number: Optional[int],
                             chain_id: Optional[int]) -> bool:
    """
    Submit a port health event to the GhostBrain signal bus.
    Subject: network.port.health
    """
    result = _post("/api/v1/signals", _message_envelope(
        "network.port.health", {
            "port":       port,
            "service":    service,
            "layer":      layer,
            "status":     status,
            "latencyMs":  latency_ms,
            "blockNumber": block_number,
            "chainId":    chain_id,
            "error":      error,
            "reportedAt": int(time.time() * 1000),
        }
    ))
    return bool(result and result.get("ok"))

def send_conflict_signal(port: int, service: str, stray_pid: int,
                          stray_process: str, risk_score: float) -> bool:
    """Submit a port conflict event to the GhostBrain signal bus."""
    result = _post("/api/v1/signals", _message_envelope(
        "network.port.conflict", {
            "port":         port,
            "service":      service,
            "strayPid":     stray_pid,
            "strayProcess": stray_process,
            "riskScore":    risk_score,
            "reportedAt":   int(time.time() * 1000),
        }
    ))
    return bool(result and result.get("ok"))

def send_routing_law_violation(detail: str, l1_status: str,
                                l2_status: str, l3_status: str) -> bool:
    """Submit a routing-law violation finding to GhostBrain."""
    result = _post("/api/v1/signals", _message_envelope(
        "ghostbrain.gsa.finding", {
            "type":      "routing_law_violation",
            "severity":  "critical",
            "detail":    detail,
            "l1Status":  l1_status,
            "l2Status":  l2_status,
            "l3Status":  l3_status,
            "reportedAt": int(time.time() * 1000),
        }
    ))
    return bool(result and result.get("ok"))

def send_probe_cycle_summary(summary: Dict[int, str]) -> bool:
    """Send end-of-cycle aggregate to GhostBrain."""
    result = _post("/api/v1/signals", _message_envelope(
        "network.probe.cycle", {
            "ports":      {str(p): s for p, s in summary.items()},
            "reportedAt": int(time.time() * 1000),
        }
    ))
    return bool(result and result.get("ok"))

# ---------------------------------------------------------------------------
# AI scoring for port health
# ---------------------------------------------------------------------------
def score_port_health(port: int, service: str, layer: str,
                       status: str, latency_ms: Optional[float],
                       error: Optional[str]) -> float:
    """
    Use GhostBrain /ai/think (system_health_check task) to score risk for a port.
    Returns float 0.0–1.0. Falls back to heuristic on failure.
    """
    result = _post("/api/v1/think", {
        "task":  "system_health_check",
        "agent": AGENT_ID,
        "payload": {
            "resource":  f"port:{port}",
            "service":   service,
            "layer":     layer,
            "status":    status,
            "latencyMs": latency_ms,
            "error":     error,
        },
    })
    if result and result.get("ok"):
        # Try to extract numeric risk from result.risk field
        risk_map = {"low": 0.2, "medium": 0.5, "high": 0.8, "critical": 0.95}
        risk_str = result.get("risk", "")
        if risk_str in risk_map:
            return risk_map[risk_str]
        # Try numeric result
        res = result.get("result")
        if isinstance(res, dict):
            score = res.get("riskScore") or res.get("risk_score") or res.get("score")
            if score is not None:
                try:
                    return float(score)
                except (TypeError, ValueError):
                    pass
    # Heuristic fallback
    if status == "down" and layer in ("L1", "L2", "L3"):
        return 0.9
    if status == "conflict":
        return 0.8
    if status == "degraded":
        return 0.5
    return 0.1

# ---------------------------------------------------------------------------
# Full cognitive analysis (significant events only)
# ---------------------------------------------------------------------------
def think_port_event(event_type: str, port: int, service: str,
                      layer: str, payload: Dict) -> Optional[Dict]:
    """
    Trigger the full 6-phase GhostBrain cognitive cycle for a significant event.
    Returns the reasoning/plan result or None.
    """
    layer_norm = layer.lower() if layer.lower() in ("l1", "l2", "l3") else "service"
    result = _post("/ai/think", {
        "event":      event_type,           # e.g. "port_conflict", "chain_rpc_down"
        "resourceId": f"port:{port}:{service}",
        "layer":      layer_norm,
        "payload":    {**payload, "port": port, "service": service},
    })
    if result:
        log.info(
            "GhostBrain think [%s] port=%d → strategy=%s",
            event_type, port,
            result.get("strategy", {}).get("approach", "?") if isinstance(result.get("strategy"), dict) else result.get("strategy", "?"),
        )
    return result

# ---------------------------------------------------------------------------
# RPC scoring — AI-selected best RPC endpoint
# ---------------------------------------------------------------------------
@dataclass
class RpcCandidate:
    url:          str
    layer:        str   # "L1" | "L2" | "L3"
    latency_ms:   float
    error_rate:   float   # 0–1
    head_lag:     int     # blocks behind
    last_ok_at:   int     # Unix ms
    circuit_open: bool

def decide_best_rpc(layer: str, candidates: List[RpcCandidate]) -> Optional[str]:
    """
    Ask GhostBrain to score and select the best RPC endpoint for a layer.
    Returns the chosen URL or None on failure.
    """
    result = _post("/api/v1/rpc/decide", {
        "intent":     {"kind": "READ", "layer": layer},
        "candidates": [asdict(c) for c in candidates],
    })
    if result:
        chosen = result.get("chosenUrl")
        reason = result.get("reason", "")
        log.info("GhostBrain RPC decision layer=%s → %s (%s)", layer, chosen, reason)
        return chosen
    return None

# ---------------------------------------------------------------------------
# Predictive / anomaly polling
# ---------------------------------------------------------------------------
def get_anomalies(resource_id: str) -> List[Dict]:
    """Pull active anomaly events for a resource from GhostBrain predictive engine."""
    result = _get(f"/api/v1/predictive/anomalies?resourceId={resource_id}")
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("anomalies", result.get("items", []))
    return []

def get_failure_predictions(resource_id: str, min_risk: str = "elevated") -> List[Dict]:
    """Pull failure predictions for a resource."""
    result = _get(f"/api/v1/predictive/failures?resourceId={resource_id}&minRisk={min_risk}")
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("predictions", result.get("items", []))
    return []

def get_recommendations() -> List[Dict]:
    """Pull load-balancer / remediation recommendations from GhostBrain."""
    result = _get("/api/v1/predictive/recommendations")
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("recommendations", result.get("items", []))
    return []

def get_active_alerts() -> List[Dict]:
    """Pull currently active GhostBrain alerts."""
    result = _get("/api/v1/observability/alerts")
    if isinstance(result, dict):
        return result.get("active", [])
    return []

# ---------------------------------------------------------------------------
# Chain-level health from GhostBrain
# ---------------------------------------------------------------------------
def get_chain_health() -> Dict[str, bool]:
    """
    Returns GhostBrain's authoritative view of chain health.
    {'l1': True, 'l2': False, 'l3': True}
    """
    result = _get("/api/v1/brain/blockchain/health")
    if isinstance(result, dict):
        return result
    return {}

def get_rpc_node_statuses() -> List[Dict]:
    """Returns GhostBrain's RPC node status list (all 3 chains)."""
    result = _get("/api/v1/brain/rpc/status")
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        return result.get("nodes", result.get("items", []))
    return []

# ---------------------------------------------------------------------------
# Action planning (eviction approval gate)
# ---------------------------------------------------------------------------
def plan_eviction(port: int, service: str, stray_pid: int,
                   stray_process: str, risk_score: float) -> Tuple[bool, str]:
    """
    Submit an eviction plan to GhostBrain action planner.
    Returns (approved: bool, plan_id: str).
    In advisory-only mode (autoExecute=false), approval implies queueing for human ratification.
    """
    import uuid as _uuid
    request_id = str(_uuid.uuid4().hex)[:16]
    result = _post("/actions/plan", {
        "requestId": request_id,
        "action":    "evict_stray_process",
        "params": {
            "port":         port,
            "service":      service,
            "strayPid":     stray_pid,
            "strayProcess": stray_process,
            "riskScore":    risk_score,
        },
        "meta": {
            "sourceLayer": "infra",
            "targetLayer": "infra",
            "intent":      "ADMIN",
        },
    })
    if result and result.get("ok"):
        plan = result.get("plan", {})
        plan_id = plan.get("requestId", request_id)
        approvals = plan.get("approvals", [])
        log.info("Eviction plan approved: port=%d pid=%d plan_id=%s approvals=%s",
                 port, stray_pid, plan_id, approvals)
        return True, plan_id
    denial = result.get("deny", "unknown") if result else "ghostbrain_unreachable"
    log.warning("Eviction plan denied: port=%d pid=%d reason=%s", port, stray_pid, denial)
    return False, ""

def commit_plan(plan_id: str) -> bool:
    """Commit an approved plan to the execution queue."""
    result = _post("/actions/commit", {"planId": plan_id})
    return bool(result and result.get("ok"))

# ---------------------------------------------------------------------------
# Signing relay (human-ratified governance proposals)
# ---------------------------------------------------------------------------
def notify_signing_relay(event: dict) -> bool:
    """Forward advisory proposal to the human-ratified signing relay."""
    body = json.dumps(event).encode()
    try:
        req = urllib.request.Request(
            f"{SIGNING_RELAY_URL}/api/v1/proposals",
            data=body,
            headers={"Content-Type": "application/json", "X-Agent-Id": AGENT_ID},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
        log.info("Proposal forwarded to signing relay: %s", event.get("type"))
        return True
    except Exception as exc:
        log.warning("signing relay unreachable: %s", exc)
        return False
