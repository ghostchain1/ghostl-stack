"""GhostStack Autonomous Cloud Kernel (GACK) — FastAPI entry point.

Port:   GACK_PORT (default 4070)
Auth:   HMAC governance header enforced on all write endpoints in prod mode.
Loop:   Autonomous kernel loop every GACK_LOOP_INTERVAL_S seconds.

Integration points
------------------
  GhostBrain Core    — AI classification queries (port 7900)
  GNMC               — infrastructure telemetry (port 4060)
  ghostdns-ai        — DNS health telemetry (port 18089)
  Signing relay      — VM scale-out proposals (port 7910)
  L1/L2/L3 RPCs     — ghost_chainId / ghost_blockNumber health checks
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from metrics import (
    GACK_DECISION_TOTAL,
    GACK_ROUTING_VIOLATION_TOTAL,
    GACK_TX_ROUTED_TOTAL,
)
from src.ai.decision_engine import InfraSnapshot, decide, query_ghostbrain
from src.blockchain.chain_orchestrator import check_all_chains
from src.blockchain.tx_router import TxRoute, describe_routing_law, route_transaction
from src.infrastructure.container_healer import heal_containers
from src.infrastructure.vm_scaler import maybe_propose_scale_out, scan_vms
from src.kernel.core import run_kernel_loop
from src.monitoring.telemetry import collect
from src.networking.routing_engine import check_route, route, routing_table
from src.networking.service_discovery import discover_services

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("gack.main")

# ── Config ────────────────────────────────────────────────────────────────────
GACK_PORT: int = int(os.getenv("GACK_PORT", "4070"))
GACK_MODE: str = os.getenv("GACK_MODE", "dev")
_SHARED_SECRET: str = os.getenv("HGOP_SHARED_SECRET", "")
GACK_LOOP_INTERVAL_S: int = max(15, int(os.getenv("GACK_LOOP_INTERVAL_S", "20")))


# ── Governance HMAC auth ──────────────────────────────────────────────────────
def _auth_check(request: Request) -> bool:
    if GACK_MODE != "prod":
        return True
    if not _SHARED_SECRET:
        return False              # fail-closed: no secret → all writes blocked
    ts = request.headers.get("X-HGOP-Timestamp", "")
    sig = request.headers.get("X-HGOP-Signature", "")
    if not ts or not sig:
        return False
    expected = hmac.new(
        _SHARED_SECRET.encode(), ts.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig)


# ── Autonomous loop ───────────────────────────────────────────────────────────
_loop_task: Optional[asyncio.Task] = None
_last_result: dict = {}
_last_ts: float = 0.0


async def _kernel_loop() -> None:
    global _last_result, _last_ts
    while True:
        try:
            _last_result = await run_kernel_loop()
            _last_ts = time.time()
        except Exception as exc:
            logger.error("Unhandled error in kernel loop: %s", exc)
        await asyncio.sleep(GACK_LOOP_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _loop_task
    _loop_task = asyncio.create_task(_kernel_loop())
    logger.info(
        "GACK started — port=%d mode=%s loop_interval=%ds",
        GACK_PORT, GACK_MODE, GACK_LOOP_INTERVAL_S,
    )
    yield
    if _loop_task:
        _loop_task.cancel()
    logger.info("GACK shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ghost-cloud-kernel",
    version="1.0.0",
    description="GhostStack Autonomous Cloud Kernel — AI-operated sovereign infrastructure",
    lifespan=lifespan,
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class TxRouteBody(BaseModel):
    source_layer: str = Field(..., pattern=r'^(L1|L2|L3)$')
    destination_layer: Optional[str] = Field(default=None, pattern=r'^(L1|L2|L3)$')


class RouteCheckBody(BaseModel):
    source_layer: str = Field(..., pattern=r'^(L1|L2|L3)$')
    destination_layer: str = Field(..., pattern=r'^(L1|L2|L3)$')


class BrainQueryBody(BaseModel):
    payload: dict


# ── Core endpoints ────────────────────────────────────────────────────────────
@app.get("/kernel-health")
async def kernel_health():
    return {
        "status": "ok",
        "service": "ghost-cloud-kernel",
        "version": "1.0.0",
        "mode": GACK_MODE,
        "loop_interval_s": GACK_LOOP_INTERVAL_S,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/status")
async def status():
    return {
        "last_loop_ts": _last_ts,
        "last_result": _last_result,
    }


@app.post("/kernel/run")
async def kernel_run(request: Request):
    """Trigger an immediate out-of-schedule kernel loop iteration."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    result = await run_kernel_loop()
    return result


# ── Infrastructure — VMs ──────────────────────────────────────────────────────
@app.get("/infra/vms")
async def infra_vms():
    """List all ghost-* VMs from the hypervisor (read-only)."""
    return scan_vms()


@app.post("/infra/vms/scale-proposal")
async def infra_vm_scale_proposal(request: Request):
    """Evaluate current VM count and emit a scale-out proposal if below threshold.
    
    Sends a proposal to the signing relay only.  Never creates VMs autonomously.
    """
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    vm_scan = scan_vms()
    proposal = maybe_propose_scale_out(vm_scan)
    if proposal is None:
        return {"message": "VM count is at or above minimum threshold — no proposal needed", "vms": vm_scan}
    return proposal


# ── Infrastructure — containers ───────────────────────────────────────────────
@app.get("/infra/containers")
async def infra_containers():
    """List discovered ghost-* services from Docker."""
    services = discover_services()
    return {
        "services": [
            {
                "name": s.name,
                "id": s.container_id,
                "status": s.status,
                "port": s.port,
                "image": s.image,
            }
            for s in services
        ]
    }


@app.post("/infra/containers/heal")
async def infra_containers_heal(request: Request):
    """Trigger an immediate self-heal pass over stopped ghost-* containers."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    events = heal_containers()
    return {"events": events}


# ── Networking ────────────────────────────────────────────────────────────────
@app.get("/network/routing-table")
async def network_routing_table():
    """Return the immutable L3→L2→L1 routing law table."""
    return {"routing_table": routing_table()}


@app.get("/network/route/{layer}")
async def network_route(layer: str):
    """Return the mandatory next hop for a given source layer."""
    l = layer.strip().upper()
    if l not in ("L1", "L2", "L3"):
        raise HTTPException(status_code=400, detail="layer must be L1, L2, or L3")
    r = route(l)
    return {
        "source": r.source,
        "next_hop": r.next_hop if r.next_hop else "terminus",
        "ok": r.ok,
    }


@app.post("/network/route/check")
async def network_route_check(body: RouteCheckBody):
    """Validate a proposed source→destination route against the routing law."""
    r = check_route(body.source_layer, body.destination_layer)
    if r.violation:
        GACK_ROUTING_VIOLATION_TOTAL.labels(
            source=body.source_layer,
            destination=body.destination_layer,
        ).inc()
    return {
        "ok": r.ok,
        "source": r.source,
        "next_hop": r.next_hop,
        "violation": r.violation,
        "reason": r.reason,
    }


@app.get("/network/services")
async def network_services():
    """Return the current service discovery map."""
    services = discover_services()
    return {
        "services": [
            {"name": s.name, "status": s.status, "port": s.port}
            for s in services
        ]
    }


# ── Blockchain ────────────────────────────────────────────────────────────────
@app.get("/blockchain/health")
async def blockchain_health():
    """Run ghost_chainId + ghost_blockNumber health checks for L1, L2, and L3."""
    results = check_all_chains()
    return {
        "chains": [
            {
                "layer": c.layer,
                "ok": c.ok,
                "block_number": c.block_number,
                "latency_ms": c.latency_ms,
                "reason": c.reason,
            }
            for c in results
        ]
    }


@app.get("/blockchain/route")
async def blockchain_route():
    """Return the full routing law with RPC endpoints."""
    return {"routing_law": describe_routing_law()}


@app.post("/blockchain/tx/route")
async def blockchain_tx_route(body: TxRouteBody):
    """Route a transaction from source_layer to its mandatory next hop.
    
    Returns a violation error if the proposed destination breaks the routing law.
    """
    tx: TxRoute = route_transaction(body.source_layer, body.destination_layer)
    if tx.violation:
        GACK_ROUTING_VIOLATION_TOTAL.labels(
            source=body.source_layer,
            destination=body.destination_layer or "auto",
        ).inc()
    if tx.ok and tx.next_hop:
        GACK_TX_ROUTED_TOTAL.labels(
            source=body.source_layer,
            next_hop=tx.next_hop,
        ).inc()
    return {
        "ok": tx.ok,
        "source": tx.source,
        "next_hop": tx.next_hop,
        "next_hop_rpc": tx.next_hop_rpc,
        "violation": tx.violation,
        "reason": tx.reason,
    }


# ── AI ────────────────────────────────────────────────────────────────────────
@app.get("/ai/decision")
async def ai_decision():
    """Run the AI decision engine against current telemetry (read-only, instant)."""
    snap = collect()
    vm_data = scan_vms()
    inf_snap = InfraSnapshot(
        cpu_load_1m=snap.cpu_load_1m,
        memory_free_bytes=snap.memory_free_bytes,
        running_vms=vm_data.get("running", 0),
        chains_unhealthy=[],
    )
    d = decide(inf_snap)
    GACK_DECISION_TOTAL.labels(decision=d.outcome).inc()
    return {
        "outcome": d.outcome,
        "reasons": d.reasons,
        "health_score": d.health_score,
    }


@app.post("/ai/brain/query")
async def ai_brain_query(body: BrainQueryBody, request: Request):
    """Forward an infrastructure payload to GhostBrain Core for classification."""
    if not _auth_check(request):
        raise HTTPException(status_code=403, detail="governance auth required")
    return query_ghostbrain(body.payload)


# ── Telemetry ─────────────────────────────────────────────────────────────────
@app.get("/telemetry")
async def telemetry():
    """Return aggregated telemetry from local host, GNMC, and ghostdns-ai."""
    snap = collect()
    return {
        "timestamp": snap.timestamp,
        "cpu_load_1m": snap.cpu_load_1m,
        "memory_free_bytes": snap.memory_free_bytes,
        "memory_total_bytes": snap.memory_total_bytes,
        "memory_free_pct": round(
            snap.memory_free_bytes / max(snap.memory_total_bytes, 1) * 100, 1
        ),
        "uptime_seconds": snap.uptime_seconds,
        "hostname": snap.hostname,
        "upstream": {
            "gnmc": snap.gnmc_ok,
            "ghostdns": snap.ghostdns_ok,
        },
    }


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=GACK_PORT, log_level="info")
