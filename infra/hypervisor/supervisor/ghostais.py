#!/usr/bin/env python3
"""
GhostStack Autonomous Infrastructure Supervisor (GAIS)
========================================================
Ties together VM management, node healing, validator rebalancing, and
auto-scaling into a single long-running service.

Components
----------
  vm_manager.py          — libvirt VM lifecycle (start/stop/restart/snapshot)
  node_healer.py         — graduated auto-repair state machine
  validator_rebalancer.py — validator distribution proposals
  auto_scaler.py         — load-driven scaling proposals
  supervisor.py          — read-only Prometheus metrics exporter (existing;
                            still runs independently on :9108)

This process
------------
  • Asyncio event loop drives all background loops.
  • REST API (FastAPI) listens on :9100 for status + manual controls.
  • Chain RPC + VM health is scraped every SCRAPE_INTERVAL_S (default 10s).
  • Healing decisions are evaluated every HEAL_INTERVAL_S (default 15s).
  • Scaling proposals are checked every SCALE_INTERVAL_S (default 180s).
  • Validator rebalance is checked every REBALANCE_INTERVAL_S (default 360s).
  • GhostBrain directive inbox is polled every DIRECTIVE_POLL_S (default 30s).

REST endpoints
--------------
  GET  /status                  — GAIS health summary
  GET  /vms                     — all VMs with state + healer status
  GET  /healing                 — healer state per VM
  GET  /scaling                 — current autoscaler status
  GET  /validators              — validator distribution snapshot
  POST /vms/{name}/restart      — manual VM restart (requires X-GAIS-Token)
  POST /vms/{name}/heal/reset   — reset healer state after human fix
  POST /vms/{name}/escalation/clear — clear circuit breaker after human fix
  POST /directives              — GhostBrain AI directive intake

Authentication
--------------
  Write endpoints require the header:
    X-GAIS-Token: <value of GAIS_API_TOKEN env var>
  Read endpoints are unauthenticated (Prometheus/Grafana friendly).

Environment variables
---------------------
  GAIS_LISTEN_ADDR        bind address (default: 0.0.0.0)
  GAIS_LISTEN_PORT        bind port (default: 9100)
  GAIS_API_TOKEN          write-endpoint bearer token (required; no default)
  GAIS_LOG_LEVEL          DEBUG|INFO|WARNING (default: INFO)
  SCRAPE_INTERVAL_S       VM scrape interval in seconds (default: 10)
  HEAL_INTERVAL_S         healing evaluation interval (default: 15)
  SCALE_INTERVAL_S        autoscale check interval (default: 180)
  REBALANCE_INTERVAL_S    validator rebalance check interval (default: 360)
  DIRECTIVE_POLL_S        GhostBrain directive poll interval (default: 30)

  (All vm_manager / node_healer / auto_scaler / validator_rebalancer env vars
  are inherited and forwarded to their respective modules.)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Dependency gate — friendly error if FastAPI/uvicorn are missing ───────────
try:
    import uvicorn
    from fastapi import Depends, FastAPI, HTTPException, Request, status
    from fastapi.responses import JSONResponse
except ImportError:
    sys.exit(
        "FastAPI / uvicorn not found.\n"
        "Install with:  pip install fastapi uvicorn[standard]\n"
        "or:            pip install -r requirements.txt"
    )

# ── Local modules (same directory) ───────────────────────────────────────────
_HERE = Path(__file__).parent
sys.path.insert(0, str(_HERE))

import auto_scaler
import node_healer
import port_manager as pm
import validator_rebalancer
import vm_manager as vmm

# ── Configuration ─────────────────────────────────────────────────────────────
LISTEN_ADDR          = os.getenv("GAIS_LISTEN_ADDR",     "0.0.0.0")
LISTEN_PORT          = int(os.getenv("GAIS_LISTEN_PORT", "9100"))
GAIS_API_TOKEN       = os.getenv("GAIS_API_TOKEN",       "")   # empty = disabled (warn only)
LOG_LEVEL            = os.getenv("GAIS_LOG_LEVEL",        "INFO").upper()

SCRAPE_INTERVAL_S    = int(os.getenv("SCRAPE_INTERVAL_S",    "10"))
HEAL_INTERVAL_S      = int(os.getenv("HEAL_INTERVAL_S",      "15"))
SCALE_INTERVAL_S     = int(os.getenv("SCALE_INTERVAL_S",     "180"))
REBALANCE_INTERVAL_S = int(os.getenv("REBALANCE_INTERVAL_S", "360"))
DIRECTIVE_POLL_S     = int(os.getenv("DIRECTIVE_POLL_S",     "30"))
PORT_SYNC_INTERVAL_S = int(os.getenv("PORT_SYNC_INTERVAL_S", "120"))

GHOSTBRAIN_URL = os.getenv("GHOSTBRAIN_URL", "http://localhost:7900").rstrip("/")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [gais] %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("gais")

if not GAIS_API_TOKEN:
    log.warning(
        "GAIS_API_TOKEN is not set — write endpoints are UNPROTECTED. "
        "Set GAIS_API_TOKEN in production."
    )

# ── Shared in-memory state ────────────────────────────────────────────────────
_vm_states:     Dict[str, str]  = {}   # name → virsh state
_vm_ips:        Dict[str, str]  = {}   # name → ip
_rpc_health:    Dict[str, bool] = {}   # name → rpc ok
_last_scrape:   float           = 0.0
_last_heal:     float           = 0.0
_last_scale:    float           = 0.0
_last_rebalance:float           = 0.0
_proposals:     List[Dict]      = []   # recent proposals (capped at 100)
_directives:    List[Dict]      = []   # received GhostBrain directives (capped at 50)


# ── VM scraping ───────────────────────────────────────────────────────────────
import re as _re
_IPV4_RE = _re.compile(r"(\d{1,3}(?:\.\d{1,3}){3})")


def _discover_ip(vm: vmm.VM) -> str:
    if vm.static_ip:
        return vm.static_ip
    # domifaddr
    rc, out = vmm._virsh("domifaddr", vm.name, timeout=5)
    if rc == 0:
        m = _IPV4_RE.search(out)
        if m and not m.group(1).startswith("169."):
            return m.group(1)
    return ""


def _rpc_probe(ip: str, port: int) -> bool:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "ghost_blockNumber", "params": []}
    ).encode()
    req = urllib.request.Request(
        f"http://{ip}:{port}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return "result" in json.loads(resp.read())
    except Exception:
        return False


def _rpc_port(role: str) -> Optional[int]:
    return {"l1": 18545, "l2": 29545, "l3": 39545}.get(role)


def scrape_vms() -> None:
    global _last_scrape
    for vm in vmm.VMS:
        state = vmm.get_state(vm.name)
        _vm_states[vm.name] = state
        ip = _discover_ip(vm) if state == "running" else (_vm_ips.get(vm.name) or "")
        _vm_ips[vm.name] = ip
        port = _rpc_port(vm.role)
        if state == "running" and ip and port:
            _rpc_health[vm.name] = _rpc_probe(ip, port)
        else:
            _rpc_health[vm.name] = False
    _last_scrape = time.time()
    log.debug("VM scrape complete. %d VMs.", len(vmm.VMS))


# ── Healing loop ──────────────────────────────────────────────────────────────
def run_healing() -> None:
    global _last_heal
    for vm in vmm.VMS:
        state  = _vm_states.get(vm.name, "unknown")
        rpc_ok = _rpc_health.get(vm.name, False)
        ip     = _vm_ips.get(vm.name, "")

        # Healthy = VM running AND RPC responding (for chain nodes)
        # For non-chain roles (dns, web, devnet) healthy = VM running
        has_rpc = vm.role in ("l1", "l2", "l3")
        is_healthy = (state == "running") and (rpc_ok if has_rpc else True)

        if is_healthy:
            node_healer.report_healthy(vm.name)
        else:
            reason = f"state={state} rpc_ok={rpc_ok}"
            node_healer.report_unhealthy(vm.name, ip=ip or None, reason=reason)

    _last_heal = time.time()


# ── GhostBrain directive processor ───────────────────────────────────────────
def poll_directives() -> None:
    """Poll GhostBrain for any pending infrastructure directives."""
    try:
        url = f"{GHOSTBRAIN_URL}/api/v1/directives?target=gais"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            items = json.loads(resp.read())
    except Exception as exc:
        log.debug("Directive poll failed: %s", exc)
        return

    if not isinstance(items, list):
        return

    for directive in items:
        d_type = directive.get("type", "")
        d_vm   = directive.get("vm", "")
        log.info("GhostBrain directive: type=%s vm=%s payload=%s", d_type, d_vm, directive)
        _directives.append(directive)
        if len(_directives) > 50:
            _directives.pop(0)

        # Act on safe directives only
        if d_type == "vm.restart" and d_vm in vmm.VM_BY_NAME:
            log.info("Executing GhostBrain-directed restart for %s", d_vm)
            try:
                vmm.vm_restart(d_vm)
            except Exception as exc:
                log.error("Brain-directed restart of %s failed: %s", d_vm, exc)

        elif d_type == "healer.reset" and d_vm:
            node_healer.reset_healer(d_vm)

        elif d_type == "escalation.clear" and d_vm:
            vmm.clear_escalation(d_vm)


# ── Background async loops ────────────────────────────────────────────────────
async def _loop(name: str, interval: float, fn) -> None:
    log.info("%s loop started (interval=%.0fs).", name, interval)
    while True:
        try:
            await asyncio.get_event_loop().run_in_executor(None, fn)
        except Exception as exc:
            log.error("%s loop error: %s", name, exc)
        await asyncio.sleep(interval)


# ── FastAPI application ───────────────────────────────────────────────────────
@asynccontextmanager
async def _lifespan(app: FastAPI):
    log.info("GAIS starting up on %s:%d …", LISTEN_ADDR, LISTEN_PORT)
    pm.init()   # load port registry + import existing iptables rules
    tasks = [
        asyncio.create_task(_loop("scrape",     SCRAPE_INTERVAL_S,    scrape_vms)),
        asyncio.create_task(_loop("heal",       HEAL_INTERVAL_S,      run_healing)),
        asyncio.create_task(_loop("scale",      SCALE_INTERVAL_S,     _run_scale)),
        asyncio.create_task(_loop("rebalance",  REBALANCE_INTERVAL_S, _run_rebalance)),
        asyncio.create_task(_loop("directives", DIRECTIVE_POLL_S,     poll_directives)),
        asyncio.create_task(_loop("port-sync",  PORT_SYNC_INTERVAL_S, _run_port_sync)),
    ]
    yield
    for t in tasks:
        t.cancel()
    pm.shutdown()
    log.info("GAIS shutdown complete.")


def _run_scale() -> None:
    global _last_scale
    proposal = auto_scaler.check_and_propose()
    _last_scale = time.time()
    if proposal:
        _proposals.append(proposal)
        if len(_proposals) > 100:
            _proposals.pop(0)


def _run_rebalance() -> None:
    global _last_rebalance
    validator_rebalancer.check_and_propose()
    _last_rebalance = time.time()


def _run_port_sync() -> None:
    """Periodic port sync: import new iptables rules, log orphans."""
    result = pm.sync_once()
    if result["imported"]:
        log.info("Port sync: imported %d new rules.", result["imported"])
    if result["orphans"]:
        log.warning(
            "Port sync: %d orphaned rule(s) detected (VMs no longer active). "
            "Review via GET /ports/orphans.",
            result["orphans"],
        )


app = FastAPI(
    title="GhostStack Autonomous Infrastructure Supervisor",
    version="1.2.0",
    description=(
        "Manages GhostStack libvirt VMs, auto-repairs nodes, rebalances validators, "
        "scales infrastructure, and provides AI-powered port management (iptables DNAT, "
        "range rules, lifecycle watching, connectivity probing, orphan pruning). "
        "All chain-state changes are advisory — no autonomous execution without governance quorum. "
        "Chain: GhostChain L1 (chain_id 14000101). Gas token: GST."
    ),
    lifespan=_lifespan,
)


# ── Auth dependency ───────────────────────────────────────────────────────────
async def _require_token(request: Request) -> None:
    if not GAIS_API_TOKEN:
        return  # token not configured — open (warn already emitted at startup)
    token = request.headers.get("X-GAIS-Token", "")
    if token != GAIS_API_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-GAIS-Token header.",
        )


# ── Read endpoints ────────────────────────────────────────────────────────────
@app.get("/status")
async def get_status() -> JSONResponse:
    healer_states = node_healer.get_all_states()
    pool          = pm.pool_status()
    return JSONResponse({
        "service":       "gais",
        "version":       "1.2.0",
        "chain_id":      14000101,
        "gas_token":     "GST",
        "routing_law":   "L3→L2→L1",
        "dry_run":       vmm.DRY_RUN,
        "vm_count":      len(vmm.VMS),
        "running_count": sum(1 for s in _vm_states.values() if s == "running"),
        "escalated":     [n for n, s in healer_states.items() if s["level"] == "escalated"],
        "last_scrape":   _last_scrape,
        "last_heal":     _last_heal,
        "last_scale":    _last_scale,
        "last_rebalance":_last_rebalance,
        "uptime":        time.time(),
        "port_manager": {
            "mappings":      len(pm.list_mappings()),
            "pool_free":     pool["free"],
            "pool_total":    pool["total"],
            "overflow_rules":pool["overflow_rules"],
            "auto_map_vms":  pm.AUTO_MAP_NEW_VMS,
            "last_sync":     _registry_last_sync(),
        },
    })


def _registry_last_sync() -> float:
    try:
        return pm._registry.last_sync
    except Exception:
        return 0.0


@app.get("/vms")
async def get_vms() -> JSONResponse:
    healer_states = node_healer.get_all_states()
    vms = []
    for vm in vmm.VMS:
        vs = vmm._vm_state(vm.name)
        vms.append({
            "name":        vm.name,
            "role":        vm.role,
            "ip":          _vm_ips.get(vm.name, ""),
            "state":       _vm_states.get(vm.name, "unknown"),
            "rpc_healthy": _rpc_health.get(vm.name, False),
            "heal_level":  healer_states.get(vm.name, {}).get("level", "healthy"),
            "escalated":   vs.escalated,
            "restarts_1h": len([t for t in vs.restart_times if t >= time.time() - 3600]),
        })
    return JSONResponse({"vms": vms, "ts": time.time()})


@app.get("/healing")
async def get_healing() -> JSONResponse:
    return JSONResponse(node_healer.get_all_states())


@app.get("/scaling")
async def get_scaling() -> JSONResponse:
    return JSONResponse(auto_scaler.get_status())


@app.get("/validators")
async def get_validators() -> JSONResponse:
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, validator_rebalancer.get_status)
    return JSONResponse(data)


@app.get("/proposals")
async def get_proposals() -> JSONResponse:
    return JSONResponse({"proposals": list(reversed(_proposals[-20:]))})


@app.get("/directives")
async def get_directives() -> JSONResponse:
    return JSONResponse({"directives": list(reversed(_directives[-20:]))})


# ── Write endpoints (token-protected) ────────────────────────────────────────
@app.post("/vms/{name}/restart", dependencies=[Depends(_require_token)])
async def manual_vm_restart(name: str, request: Request) -> JSONResponse:
    if name not in vmm.VM_BY_NAME:
        raise HTTPException(status_code=404, detail=f"VM '{name}' not found.")
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    force = bool(body.get("force", False))

    log.info("Manual restart requested for %s (force=%s).", name, force)
    try:
        loop = asyncio.get_event_loop()
        ok   = await loop.run_in_executor(None, lambda: vmm.vm_restart(name, force_shutdown=force))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return JSONResponse({"vm": name, "restarted": ok, "force": force})


@app.post("/vms/{name}/heal/reset", dependencies=[Depends(_require_token)])
async def manual_heal_reset(name: str) -> JSONResponse:
    if name not in vmm.VM_BY_NAME:
        raise HTTPException(status_code=404, detail=f"VM '{name}' not found.")
    node_healer.reset_healer(name)
    return JSONResponse({"vm": name, "healer_reset": True})


@app.post("/vms/{name}/escalation/clear", dependencies=[Depends(_require_token)])
async def manual_clear_escalation(name: str) -> JSONResponse:
    if name not in vmm.VM_BY_NAME:
        raise HTTPException(status_code=404, detail=f"VM '{name}' not found.")
    vmm.clear_escalation(name)
    node_healer.reset_healer(name)
    return JSONResponse({"vm": name, "escalation_cleared": True})


@app.post("/directives", dependencies=[Depends(_require_token)])
async def receive_directive(request: Request) -> JSONResponse:
    """
    Endpoint for GhostBrain (or human operators) to push an infrastructure
    directive directly.  The directive is validated and processed immediately.
    """
    try:
        directive = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    required = {"type"}
    if not required.issubset(directive):
        raise HTTPException(status_code=422, detail=f"Missing required fields: {required}.")

    _directives.append(directive)
    if len(_directives) > 50:
        _directives.pop(0)

    d_type = directive.get("type", "")
    d_vm   = directive.get("vm", "")
    log.info("Received directive via API: type=%s vm=%s", d_type, d_vm)

    # Execute safe synchronous directives inline
    result = {"accepted": True, "type": d_type}

    if d_type == "vm.restart" and d_vm in vmm.VM_BY_NAME:
        try:
            loop = asyncio.get_event_loop()
            ok   = await loop.run_in_executor(None, lambda: vmm.vm_restart(d_vm))
            result["executed"] = ok
        except RuntimeError as exc:
            result["executed"] = False
            result["error"]    = str(exc)

    elif d_type == "healer.reset" and d_vm:
        node_healer.reset_healer(d_vm)
        result["executed"] = True

    elif d_type == "escalation.clear" and d_vm:
        vmm.clear_escalation(d_vm)
        node_healer.reset_healer(d_vm)
        result["executed"] = True

    else:
        result["executed"] = False
        result["note"] = "Directive type not handled or vm not found — stored for audit."

    return JSONResponse(result)


# ── Port Manager endpoints ─────────────────────────────────────────────────────

@app.get("/ports")
async def ports_list() -> JSONResponse:
    """List all registered port mappings."""
    return JSONResponse({
        "mappings": pm.list_mappings(),
        "pool":     pm.pool_status(),
        "ts":       time.time(),
    })


@app.get("/ports/pool")
async def ports_pool() -> JSONResponse:
    """Public IP pool allocation status."""
    return JSONResponse(pm.pool_status())


@app.get("/ports/orphans")
async def ports_orphans() -> JSONResponse:
    """
    Detect orphaned DNAT rules — mappings whose VM IP is no longer
    active in any DHCP lease.
    """
    loop = asyncio.get_event_loop()
    orphans = await loop.run_in_executor(None, pm.find_orphans)
    return JSONResponse({"orphans": orphans, "count": len(orphans), "ts": time.time()})


@app.get("/ports/{mapping_id}")
async def ports_get(mapping_id: str) -> JSONResponse:
    """Get a specific mapping by ID."""
    m = pm.get_mapping(mapping_id)
    if m is None:
        raise HTTPException(status_code=404, detail=f"Mapping '{mapping_id}' not found.")
    return JSONResponse(m)


@app.post("/ports/suggest")
async def ports_suggest(request: Request) -> JSONResponse:
    """
    AI-generate recommended port mappings for a VM.

    Body: { "vm_name": "...", "vm_ip": "...", "role": "..." (optional) }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    vm_name = body.get("vm_name", "")
    vm_ip   = body.get("vm_ip", "")
    role    = body.get("role")

    if not vm_name or not vm_ip:
        raise HTTPException(status_code=422, detail="vm_name and vm_ip are required.")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: pm.suggest_mappings(vm_name, vm_ip, role)
    )
    return JSONResponse(result)


@app.post("/ports/suggest/apply", dependencies=[Depends(_require_token)])
async def ports_suggest_apply(request: Request) -> JSONResponse:
    """
    AI-suggest AND immediately apply all non-conflicting port mappings for a VM.

    Body: { "vm_name": "...", "vm_ip": "...", "role": "..." (optional) }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    vm_name = body.get("vm_name", "")
    vm_ip   = body.get("vm_ip", "")
    role    = body.get("role")

    if not vm_name or not vm_ip:
        raise HTTPException(status_code=422, detail="vm_name and vm_ip are required.")

    loop   = asyncio.get_event_loop()
    plan   = await loop.run_in_executor(None, lambda: pm.suggest_mappings(vm_name, vm_ip, role))
    applied = await loop.run_in_executor(None, lambda: pm.apply_suggestions(plan["suggestions"]))

    return JSONResponse({
        "plan":    plan,
        "applied": applied,
        "ts":      time.time(),
    })


@app.post("/ports", dependencies=[Depends(_require_token)])
async def ports_add(request: Request) -> JSONResponse:
    """
    Manually register and apply a port mapping.

    Body: {
      "vm_name":  "ghostchain-devnet-v2",
      "vm_ip":    "192.168.122.58",
      "vm_port":  22,
      "pub_ip":   "208.110.71.164",
      "pub_port": 443,
      "protocol": "tcp",     (optional, default "tcp")
      "label":    "ssh"      (optional)
    }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    required = {"vm_name", "vm_ip", "vm_port", "pub_ip", "pub_port"}
    missing = required - set(body)
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {missing}.")

    loop = asyncio.get_event_loop()
    ok, msg, mapping = await loop.run_in_executor(
        None,
        lambda: pm.add_mapping(
            vm_name=body["vm_name"],
            vm_ip=body["vm_ip"],
            vm_port=int(body["vm_port"]),
            pub_ip=body["pub_ip"],
            pub_port=int(body["pub_port"]),
            protocol=body.get("protocol", "tcp"),
            label=body.get("label", ""),
        ),
    )

    if not ok and mapping is None:
        raise HTTPException(status_code=409, detail=msg)

    return JSONResponse({"ok": ok, "message": msg, "mapping": mapping}, status_code=201 if ok else 409)


@app.delete("/ports/{mapping_id}", dependencies=[Depends(_require_token)])
async def ports_remove(mapping_id: str) -> JSONResponse:
    """Remove a mapping and tear down its iptables rules."""
    loop = asyncio.get_event_loop()
    ok, msg = await loop.run_in_executor(None, lambda: pm.remove_mapping(mapping_id))
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return JSONResponse({"ok": True, "message": msg})


@app.post("/ports/sync", dependencies=[Depends(_require_token)])
async def ports_sync() -> JSONResponse:
    """
    Trigger an immediate sync: import new iptables rules + detect orphans.
    Safe to call at any time; idempotent.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, pm.sync_once)
    return JSONResponse(result)


@app.get("/ports/{mapping_id}/probe")
async def ports_probe_mapping(mapping_id: str) -> JSONResponse:
    """Re-probe VM connectivity for a specific mapping and persist the result."""
    m_data = pm.get_mapping(mapping_id)
    if m_data is None:
        raise HTTPException(status_code=404, detail=f"Mapping '{mapping_id}' not found.")
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: pm.probe_mapping(mapping_id))
    return JSONResponse(result)


@app.get("/ports/{mapping_id}/stats")
async def ports_mapping_stats(mapping_id: str) -> JSONResponse:
    """Read live iptables packet/byte counters for a mapping."""
    loop  = asyncio.get_event_loop()
    stats = await loop.run_in_executor(None, lambda: pm.mapping_stats(mapping_id))
    if stats is None:
        raise HTTPException(
            status_code=404,
            detail=f"Mapping '{mapping_id}' not found or no counter data available.",
        )
    return JSONResponse(stats)


@app.post("/ports/range", dependencies=[Depends(_require_token)])
async def ports_add_range(request: Request) -> JSONResponse:
    """
    Apply a port-range DNAT mapping.
    Body: {vm_name, vm_ip, vm_port_start, vm_port_end, pub_ip, pub_port_start, protocol?}
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")
    required = {"vm_name", "vm_ip", "vm_port_start", "vm_port_end", "pub_ip", "pub_port_start"}
    missing  = required - set(body)
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {sorted(missing)}.")
    loop = asyncio.get_event_loop()
    ok, msg = await loop.run_in_executor(
        None,
        lambda: pm.add_range_mapping(
            vm_name=body["vm_name"],
            vm_ip=body["vm_ip"],
            vm_port_start=int(body["vm_port_start"]),
            vm_port_end=int(body["vm_port_end"]),
            pub_ip=body["pub_ip"],
            pub_port_start=int(body["pub_port_start"]),
            protocol=body.get("protocol", "tcp"),
            label=body.get("label", ""),
        ),
    )
    if not ok:
        raise HTTPException(status_code=409, detail=msg)
    return JSONResponse({"ok": ok, "message": msg}, status_code=201)


@app.post("/ports/prune", dependencies=[Depends(_require_token)])
async def ports_prune(request: Request) -> JSONResponse:
    """
    Detect and optionally remove orphaned port mappings.
    Body: {"auto_remove": false}  — default false (report only)
    """
    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass
    auto_remove = bool(body.get("auto_remove", False))
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: pm.prune_orphans(auto_remove=auto_remove))
    return JSONResponse(result)


@app.post("/ports/vm/{vm_name}/map", dependencies=[Depends(_require_token)])
async def ports_map_vm(vm_name: str, request: Request) -> JSONResponse:
    """
    AI-detect role and apply the full port profile for a VM in one call.
    Body: {"vm_ip": "...", "role": "..." (optional), "force": false (optional)}
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")
    vm_ip = body.get("vm_ip", "")
    if not vm_ip:
        raise HTTPException(status_code=422, detail="vm_ip is required.")
    role  = body.get("role")
    force = bool(body.get("force", False))
    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: pm.add_all_for_vm(vm_name, vm_ip, role=role, force=force)
    )
    return JSONResponse(result, status_code=201)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "ghostais:app",
        host=LISTEN_ADDR,
        port=LISTEN_PORT,
        log_level=LOG_LEVEL.lower(),
        access_log=False,   # we use our own structured logs
        reload=False,
    )
