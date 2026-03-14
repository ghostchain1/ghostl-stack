"""
GhostStack — Auto Scaler
=========================
Reads live metrics (via Prometheus query API or the metrics snapshot written by
metrics_collector.sh) and emits advisory scaling proposals to the signing relay.

Safety invariants
-----------------
* All proposals are ADVISORY — no VMs are provisioned or destroyed without a
  governance quorum ratification.
* Scale-down proposals are never submitted if fewer than MIN_ACTIVE_L1_NODES or
  MIN_ACTIVE_L2_NODES are currently running (safety floor).
* Proposals have a minimum PROPOSAL_COOLDOWN_S interval to prevent spamming
  the relay with duplicate recommendations.
* Routing law preserved: L1 capacity is always scaled before L2; L2 before L3.

Scaling factors evaluated
--------------------------
  CPU idle pct     < SCALE_UP_CPU_IDLE    → scale-up candidate
  CPU idle pct     > SCALE_DOWN_CPU_IDLE  → scale-down candidate
  RAM used pct     > SCALE_UP_RAM_USED    → scale-up candidate
  L2 lag (blocks)  > L2_LAG_THRESHOLD     → scale-up L2
  L3 lag (blocks)  > L3_LAG_THRESHOLD     → scale-up L3
  tx_per_s         > TX_SCALE_UP          → scale-up candidate

Environment variables
---------------------
  PROMETHEUS_URL            Prometheus base URL (default: http://localhost:9090)
  METRICS_SNAPSHOT_FILE     fallback JSON snapshot path (default: .tmp/metrics_snapshot.json)
  SIGNING_RELAY_URL         signing relay URL (default: http://localhost:7910)
  GHOSTBRAIN_URL            GhostBrain Core URL (default: http://localhost:7900)
  SCALE_UP_CPU_IDLE         CPU idle % below which scale-up is triggered (default: 20)
  SCALE_DOWN_CPU_IDLE       CPU idle % above which scale-down is triggered (default: 70)
  SCALE_UP_RAM_USED         RAM used % above which scale-up triggered (default: 85)
  L2_LAG_THRESHOLD          L2 lag in blocks before scale-up (default: 50)
  L3_LAG_THRESHOLD          L3 lag in blocks before scale-up (default: 100)
  TX_SCALE_UP_PER_S         tx/s above which scale-up triggered (default: 500)
  MIN_ACTIVE_L1_NODES       floor: never scale below this many L1 nodes (default: 3)
  MIN_ACTIVE_L2_NODES       floor: never scale below this many L2 nodes (default: 2)
  PROPOSAL_COOLDOWN_S       minimum seconds between repeated proposals (default: 300)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

log = logging.getLogger("auto_scaler")

PROMETHEUS_URL        = os.getenv("PROMETHEUS_URL", "http://localhost:9090").rstrip("/")
_REPO_ROOT            = Path(__file__).resolve().parents[3]
METRICS_SNAPSHOT_FILE = Path(os.getenv(
    "METRICS_SNAPSHOT_FILE",
    str(_REPO_ROOT / ".tmp" / "metrics_snapshot.json"),
))
SIGNING_RELAY_URL     = os.getenv("SIGNING_RELAY_URL", "http://localhost:7910").rstrip("/")
GHOSTBRAIN_URL        = os.getenv("GHOSTBRAIN_URL", "http://localhost:7900").rstrip("/")

SCALE_UP_CPU_IDLE    = int(os.getenv("SCALE_UP_CPU_IDLE",    "20"))
SCALE_DOWN_CPU_IDLE  = int(os.getenv("SCALE_DOWN_CPU_IDLE",  "70"))
SCALE_UP_RAM_USED    = int(os.getenv("SCALE_UP_RAM_USED",    "85"))
L2_LAG_THRESHOLD     = int(os.getenv("L2_LAG_THRESHOLD",     "50"))
L3_LAG_THRESHOLD     = int(os.getenv("L3_LAG_THRESHOLD",     "100"))
TX_SCALE_UP_PER_S    = int(os.getenv("TX_SCALE_UP_PER_S",    "500"))

MIN_ACTIVE_L1_NODES  = int(os.getenv("MIN_ACTIVE_L1_NODES",  "3"))
MIN_ACTIVE_L2_NODES  = int(os.getenv("MIN_ACTIVE_L2_NODES",  "2"))
PROPOSAL_COOLDOWN_S  = int(os.getenv("PROPOSAL_COOLDOWN_S",  "300"))

L1_CHAIN_ID = 14000101
GAS_TOKEN   = "GST"

_last_proposal_at: float = 0.0


# ── Metrics snapshot ──────────────────────────────────────────────────────────
@dataclass
class Metrics:
    cpu_idle_pct:  float = 50.0
    ram_used_pct:  float = 40.0
    l2_lag_blocks: int   = 0
    l3_lag_blocks: int   = 0
    tx_per_s:      float = 0.0
    active_l1:     int   = 0
    active_l2:     int   = 0
    ts:            float = 0.0


def _prom_scalar(query: str) -> Optional[float]:
    """Execute an instant Prometheus query; return the float value or None."""
    try:
        url = f"{PROMETHEUS_URL}/api/v1/query?query={urllib.request.quote(query)}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
        result = data.get("data", {}).get("result", [])
        if result:
            return float(result[0]["value"][1])
    except Exception as exc:
        log.debug("Prometheus query %r failed: %s", query, exc)
    return None


def collect_metrics() -> Metrics:
    """
    Collect metrics from Prometheus (primary) or fallback to snapshot file.
    """
    m = Metrics(ts=time.time())

    # Try Prometheus first
    cpu = _prom_scalar("avg(rate(node_cpu_seconds_total{mode='idle'}[2m])) * 100")
    ram_used = _prom_scalar(
        "100 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)"
    )
    l2_lag = _prom_scalar("ghoststack_l2_lag_blocks")
    l3_lag = _prom_scalar("ghoststack_l3_lag_blocks")
    tx_ps  = _prom_scalar("rate(ghoststack_tx_total[1m])")
    al1    = _prom_scalar("sum(ghoststack_vm_up{role='l1'})")
    al2    = _prom_scalar("sum(ghoststack_vm_up{role='l2'})")

    if cpu is not None:
        m.cpu_idle_pct  = round(cpu, 1)
        m.ram_used_pct  = round(ram_used or 0.0, 1)
        m.l2_lag_blocks = int(l2_lag or 0)
        m.l3_lag_blocks = int(l3_lag or 0)
        m.tx_per_s      = round(tx_ps or 0.0, 2)
        m.active_l1     = int(al1 or 0)
        m.active_l2     = int(al2 or 0)
        log.debug("Metrics from Prometheus: %s", m)
        return m

    # Fallback to snapshot file written by metrics_collector.sh
    if METRICS_SNAPSHOT_FILE.exists():
        try:
            raw = json.loads(METRICS_SNAPSHOT_FILE.read_text())
            m.cpu_idle_pct  = float(raw.get("cpu_idle_pct", 50))
            m.ram_used_pct  = float(raw.get("ram_used_pct", 40))
            m.l2_lag_blocks = int(raw.get("l2_lag_blocks", 0))
            m.l3_lag_blocks = int(raw.get("l3_lag_blocks", 0))
            m.tx_per_s      = float(raw.get("tx_per_s", 0))
            m.active_l1     = int(raw.get("active_l1_nodes", 0))
            m.active_l2     = int(raw.get("active_l2_nodes", 0))
            log.debug("Metrics from snapshot: %s", m)
            return m
        except Exception as exc:
            log.warning("Snapshot read failed: %s", exc)

    log.warning("No metric source available — using default neutral values.")
    return m


# ── Scaling decision ──────────────────────────────────────────────────────────
def _decide(m: Metrics) -> Tuple[str, str]:
    """
    Returns (recommendation, reason).
    recommendation ∈ {'scale_up', 'scale_down', 'none'}.
    """
    cpu_up   = m.cpu_idle_pct < SCALE_UP_CPU_IDLE
    cpu_down = m.cpu_idle_pct > SCALE_DOWN_CPU_IDLE
    ram_up   = m.ram_used_pct >= SCALE_UP_RAM_USED
    l2_up    = m.l2_lag_blocks >= L2_LAG_THRESHOLD
    l3_up    = m.l3_lag_blocks >= L3_LAG_THRESHOLD
    tx_up    = m.tx_per_s >= TX_SCALE_UP_PER_S

    if cpu_up or ram_up or l2_up or l3_up or tx_up:
        parts = []
        if cpu_up:    parts.append(f"cpu_idle={m.cpu_idle_pct:.0f}%<{SCALE_UP_CPU_IDLE}%")
        if ram_up:    parts.append(f"ram_used={m.ram_used_pct:.0f}%>={SCALE_UP_RAM_USED}%")
        if l2_up:     parts.append(f"l2_lag={m.l2_lag_blocks}>={L2_LAG_THRESHOLD}")
        if l3_up:     parts.append(f"l3_lag={m.l3_lag_blocks}>={L3_LAG_THRESHOLD}")
        if tx_up:     parts.append(f"tx/s={m.tx_per_s:.0f}>={TX_SCALE_UP_PER_S}")
        return "scale_up", "; ".join(parts)

    if cpu_down and m.ram_used_pct < 40:
        # Safety floor
        if m.active_l1 <= MIN_ACTIVE_L1_NODES:
            return "none", f"scale-down skipped: active L1 nodes ({m.active_l1}) at floor ({MIN_ACTIVE_L1_NODES})"
        if m.active_l2 <= MIN_ACTIVE_L2_NODES:
            return "none", f"scale-down skipped: active L2 nodes ({m.active_l2}) at floor ({MIN_ACTIVE_L2_NODES})"
        return "scale_down", f"cpu_idle={m.cpu_idle_pct:.0f}%>{SCALE_DOWN_CPU_IDLE}% ram_used={m.ram_used_pct:.0f}%<40%"

    return "none", "load within normal range"


# ── Proposal submission ───────────────────────────────────────────────────────
def _post_json(url: str, payload: Dict) -> bool:
    try:
        body = json.dumps(payload).encode()
        req  = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8):
            return True
    except Exception as exc:
        log.warning("POST %s failed: %s", url, exc)
        return False


def check_and_propose() -> Optional[Dict]:
    """
    Full autoscale cycle.  Returns the submitted proposal dict, or None.
    """
    global _last_proposal_at

    m    = collect_metrics()
    rec, reason = _decide(m)

    log.info(
        "Autoscale decision: %s | cpu_idle=%.0f%% ram=%.0f%% l2_lag=%d l3_lag=%d tx/s=%.1f",
        rec, m.cpu_idle_pct, m.ram_used_pct, m.l2_lag_blocks, m.l3_lag_blocks, m.tx_per_s,
    )

    if rec == "none":
        log.debug("No scaling action needed: %s", reason)
        return None

    now = time.time()
    if now - _last_proposal_at < PROPOSAL_COOLDOWN_S:
        remaining = int(PROPOSAL_COOLDOWN_S - (now - _last_proposal_at))
        log.info("Proposal cooldown active (%ds remaining) — skipping.", remaining)
        return None

    proposal: Dict[str, Any] = {
        "id":              f"autoscale-{int(now)}",
        "type":            "autoscale",
        "recommendation":  rec,
        "reason":          reason,
        "chain_id":        L1_CHAIN_ID,
        "gas_token":       GAS_TOKEN,
        "metrics": {
            "cpu_idle_pct":   m.cpu_idle_pct,
            "ram_used_pct":   m.ram_used_pct,
            "l2_lag_blocks":  m.l2_lag_blocks,
            "l3_lag_blocks":  m.l3_lag_blocks,
            "tx_per_s":       m.tx_per_s,
            "active_l1":      m.active_l1,
            "active_l2":      m.active_l2,
        },
        "proposed_at":     int(now),
        "requires_quorum": True,
    }

    url = f"{SIGNING_RELAY_URL}/proposals"
    ok  = _post_json(url, proposal)
    if ok:
        _last_proposal_at = now
        log.info("Autoscale proposal %s submitted (rec=%s).", proposal["id"], rec)
        # Notify GhostBrain
        _post_json(
            f"{GHOSTBRAIN_URL}/api/v1/signals",
            {
                "source":   "auto-scaler",
                "type":     "autoscale.proposed",
                "proposal": proposal["id"],
                "rec":      rec,
                "reason":   reason,
                "ts":       int(now),
            },
        )
    else:
        log.error("Autoscale proposal %s rejected by relay.", proposal["id"])
        return None

    return proposal


# ── Status snapshot ───────────────────────────────────────────────────────────
def get_status() -> Dict:
    m = collect_metrics()
    rec, reason = _decide(m)
    return {
        "recommendation":  rec,
        "reason":          reason,
        "metrics":         vars(m),
        "last_proposal_at": _last_proposal_at,
        "cooldown_remaining": max(0, int(PROPOSAL_COOLDOWN_S - (time.time() - _last_proposal_at))),
    }
