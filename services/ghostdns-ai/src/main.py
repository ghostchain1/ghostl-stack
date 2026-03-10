from __future__ import annotations

import json
import os
import shutil
import socket
import threading
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, Field

from src.bind.generator import BindTemplateContext, render_bind_files
from src.cert.acme_manager import AcmeManager
from src.eventlog import EventLogger
from src.governance import GovernanceVerifier
from src.health import health_status
from src.intelligence.anomaly_detector import AnomalyDetector
from src.intelligence.domain_guardian import DomainGuardian
from src.metrics import (
    GHOSTDNS_ANOMALY_DETECTED_TOTAL,
    GHOSTDNS_RECONCILE_FAIL_TOTAL,
    GHOSTDNS_RECONCILE_TOTAL,
    GHOSTDNS_RECURSION_DENIED_TOTAL,
    GHOSTDNS_RELOAD_TOTAL,
    GHOSTDNS_RECORD_OPS_TOTAL,
    GHOSTDNS_ZONE_SERIAL,
)
from src.policy import default_static_records, merge_records
from src.scanner_docker import scan_docker_records
from src.scanner_libvirt import scan_libvirt_records
from src.zone_manager import DnsRecord, render_zone, safe_reload, sha256, validate_bind, write_zone


# Valid record types — A-only for legacy endpoint; multi-type for /records/multi
_ALLOWED_RTYPES = frozenset(["A", "AAAA", "CNAME", "TXT", "MX", "SRV", "CAA", "NS"])


class UpsertRecord(BaseModel):
    fqdn: str
    type: Literal["A"] = "A"
    value: str
    ttl: int = Field(default=300, ge=30, le=86400)
    source: str = "manual"


class UpsertMultiRecord(BaseModel):
    fqdn: str
    type: str = "A"
    value: str
    ttl: int = Field(default=300, ge=30, le=86400)
    source: str = "manual"

    def to_dns_record(self) -> DnsRecord:
        rtype = self.type.upper()
        if rtype not in _ALLOWED_RTYPES:
            raise ValueError(f"unsupported record type: {rtype!r}")
        return DnsRecord(fqdn=self.fqdn.lower(), rtype=rtype, value=self.value, ttl=self.ttl)  # type: ignore[arg-type]


class CloudflareSyncBody(BaseModel):
    proxied: bool = False


class DeleteRecord(BaseModel):
    fqdn: str


class ModeBody(BaseModel):
    mode: Literal["dev", "test", "prod"]


app = FastAPI(title="ghostdns-ai", version="1.0.0")
DOMAIN = os.getenv("GHOSTDNS_DOMAIN", "ghostchain.cloud")
MODE = os.getenv("GHOSTDNS_MODE", "dev")
UPSTREAM_DNS = os.getenv("UPSTREAM_DNS", "1.1.1.1,8.8.8.8")
ALLOW_RECURSION_CIDRS = os.getenv("ALLOW_RECURSION_CIDRS", "127.0.0.0/8,172.16.0.0/12,192.168.0.0/16")
HGOP_URL = os.getenv("HGOP_URL", "http://hyper-ghost-supervisor:7077")
HGOP_SHARED_SECRET = os.getenv("HGOP_SHARED_SECRET", "")
HYPERVISOR_IP = os.getenv("GHOSTDNS_HYPERVISOR_IP", "192.168.122.205")
DOCKER_GATEWAY_IP = os.getenv("GHOSTDNS_DOCKER_GATEWAY_IP", "172.17.0.1")
VM_LEASES_FILE = Path(os.getenv("GHOSTDNS_VM_LEASES_FILE", "/app/state/vm_leases.json"))
STATE_DIR = Path(os.getenv("GHOSTDNS_STATE_DIR", "/app/state"))
EVENT_FALLBACK_LOG = Path(os.getenv("GHOSTDNS_EVENT_FALLBACK_LOG", str(STATE_DIR / "events-fallback.log")))
BIND_ETC = Path(os.getenv("GHOSTDNS_BIND_ETC", "/etc/bind"))
BIND_CONFIG_DIR = Path(os.getenv("GHOSTDNS_CONFIG_DIR", "/app/config"))
ZONE_TEMPLATE = BIND_CONFIG_DIR / "db.ghostchain.cloud.template"
ZONE_PATH = BIND_ETC / "zones" / "db.ghostchain.cloud"
NAMES_CHECKCONF = os.getenv("GHOSTDNS_NAMED_CHECKCONF", "named-checkconf")
NAMES_CHECKZONE = os.getenv("GHOSTDNS_NAMED_CHECKZONE", "named-checkzone")
RELOAD_CMD = os.getenv("GHOSTDNS_RELOAD_CMD", "rndc reload")
RECONCILE_INTERVAL_SECONDS = max(15, int(os.getenv("GHOSTDNS_RECONCILE_INTERVAL_SECONDS", "60")))

runtime_records: dict[str, tuple[str, int]] = {}
runtime_multi_records: list[DnsRecord] = []  # CNAME/TXT/MX/SRV/CAA/AAAA
last_zone_text = ""

logger     = EventLogger(HGOP_URL, EVENT_FALLBACK_LOG)
governance = GovernanceVerifier(HGOP_SHARED_SECRET, MODE, STATE_DIR / "nonces.json")

# ── AI intelligence singletons ────────────────────────────────────────────────
_anomaly_detector  = AnomalyDetector()
_domain_guardian   = DomainGuardian()
_acme_manager      = AcmeManager()
_last_anomalies: list[dict] = []
_last_domain_statuses: list[dict] = []
_last_cert_statuses: list[dict] = []


def _snapshot_last_good(zone_text: str) -> str:
    digest = sha256(zone_text)
    target = STATE_DIR / "last_good" / f"{digest}.zone"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(zone_text, encoding="utf-8")
    return digest


def _revert_last_good() -> None:
    snapshots = sorted((STATE_DIR / "last_good").glob("*.zone"), reverse=True)
    if not snapshots:
        return
    shutil.copy2(snapshots[0], ZONE_PATH)


def _build_records() -> dict[str, tuple[str, int]]:
    static = default_static_records(HYPERVISOR_IP, DOCKER_GATEWAY_IP)
    discovered = merge_records(scan_docker_records(DOMAIN), scan_libvirt_records(DOMAIN, VM_LEASES_FILE))
    merged = {**static, **discovered}
    merged.update({k: v for k, v in runtime_records.items()})
    return {name: value if isinstance(value, tuple) else (value, 300) for name, value in merged.items()}


def _format_acl_lines() -> str:
    cidrs = [x.strip() for x in ALLOW_RECURSION_CIDRS.split(",") if x.strip()]
    return "\n".join(f"  {cidr};" for cidr in cidrs)


def _format_upstream_lines() -> str:
    resolvers = [x.strip() for x in UPSTREAM_DNS.split(",") if x.strip()]
    return "\n".join(f"    {resolver};" for resolver in resolvers)


def reconcile() -> dict:
    global last_zone_text
    GHOSTDNS_RECONCILE_TOTAL.inc()

    context = BindTemplateContext(
        recursion_cidrs=_format_acl_lines(),
        upstream_dns=_format_upstream_lines(),
        bind_listen_ipv4="any",
        zone_dir=str(BIND_ETC / "zones"),
    )
    render_bind_files(BIND_CONFIG_DIR, BIND_ETC, context)

    records = _build_records()
    template_text = ZONE_TEMPLATE.read_text(encoding="utf-8")
    zone_state = render_zone(DOMAIN, template_text, records, multi_records=runtime_multi_records)

    try:
        write_zone(ZONE_PATH, zone_state.rendered)
        validate_bind(NAMES_CHECKCONF, NAMES_CHECKZONE, DOMAIN, ZONE_PATH)
        safe_reload(RELOAD_CMD)
        GHOSTDNS_RELOAD_TOTAL.inc()
        GHOSTDNS_ZONE_SERIAL.set(zone_state.serial)
        digest = _snapshot_last_good(zone_state.rendered)
        last_zone_text = zone_state.rendered
        # ── AI anomaly detection ─────────────────────────────────────────────
        global _last_anomalies
        anomalies = _anomaly_detector.update(records)
        _last_anomalies = [
            {"kind": a.kind, "severity": a.severity, "detail": a.detail, "ts": a.ts}
            for a in anomalies
        ]
        if anomalies:
            logger.emit("warning", "anomalies", "dns_anomalies_detected", {"count": len(anomalies), "kinds": [a.kind for a in anomalies]})
        logger.emit("info", "reconcile", "reconcile_applied", {"serial": zone_state.serial, "hash": digest})
        return {"ok": True, "serial": zone_state.serial, "records": len(records) + len(runtime_multi_records), "hash": digest, "anomalies": len(anomalies)}
    except Exception as exc:
        GHOSTDNS_RECONCILE_FAIL_TOTAL.inc()
        _revert_last_good()
        logger.emit("error", "reconcile", "reconcile_failed_reverted", {"error": str(exc)})
        raise


@app.get("/health")
def get_health() -> dict:
    status = health_status()
    status.update({"mode": MODE, "domain": DOMAIN})
    return status


@app.get("/metrics")
def get_metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest().decode("utf-8"), media_type=CONTENT_TYPE_LATEST)


@app.post("/reconcile")
def post_reconcile() -> dict:
    try:
        return reconcile()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/zone")
def get_zone() -> dict:
    if not last_zone_text and ZONE_PATH.exists():
        text = ZONE_PATH.read_text(encoding="utf-8")
    else:
        text = last_zone_text
    return {"ok": True, "zone": text}


@app.post("/records/upsert")
async def post_records_upsert(
    req: Request,
    body: UpsertRecord,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    runtime_records[body.fqdn.lower()] = (body.value, body.ttl)
    logger.emit("info", "record_upsert", "record_upserted", body.model_dump())
    return reconcile()


@app.post("/records/delete")
async def post_records_delete(
    req: Request,
    body: DeleteRecord,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    runtime_records.pop(body.fqdn.lower(), None)
    logger.emit("info", "record_delete", "record_deleted", body.model_dump())
    return reconcile()


@app.post("/reload")
def post_reload(
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, "{}")
    try:
        validate_bind(NAMES_CHECKCONF, NAMES_CHECKZONE, DOMAIN, ZONE_PATH)
        safe_reload(RELOAD_CMD)
        GHOSTDNS_RELOAD_TOTAL.inc()
        return {"ok": True}
    except Exception as exc:
        logger.emit("error", "reload", "reload_failed", {"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/set-mode")
def post_set_mode(body: ModeBody) -> dict:
    global MODE
    MODE = body.mode
    governance.mode = MODE
    return {"ok": True, "mode": MODE}


# ── Multi-type record management ──────────────────────────────────────────────

@app.post("/records/multi/upsert")
async def post_records_multi_upsert(
    req: Request,
    body: UpsertMultiRecord,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    rec = body.to_dns_record()
    # Remove any existing record with same fqdn+type, then append
    runtime_multi_records[:] = [
        r for r in runtime_multi_records if not (r.fqdn == rec.fqdn and r.rtype == rec.rtype)
    ]
    runtime_multi_records.append(rec)
    GHOSTDNS_RECORD_OPS_TOTAL.labels(rtype=rec.rtype, op="upsert").inc()
    logger.emit("info", "record_multi_upsert", "multi_record_upserted", body.model_dump())
    return reconcile()


@app.post("/records/multi/delete")
async def post_records_multi_delete(
    req: Request,
    body: DeleteRecord,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    before = len(runtime_multi_records)
    runtime_multi_records[:] = [r for r in runtime_multi_records if r.fqdn != body.fqdn.lower()]
    GHOSTDNS_RECORD_OPS_TOTAL.labels(rtype="ANY", op="delete").inc()
    logger.emit("info", "record_multi_delete", "multi_record_deleted", {"fqdn": body.fqdn, "removed": before - len(runtime_multi_records)})
    return reconcile()


@app.get("/records/multi")
def get_records_multi() -> dict:
    return {
        "ok": True,
        "records": [
            {"fqdn": r.fqdn, "type": r.rtype, "value": r.value, "ttl": r.ttl}
            for r in runtime_multi_records
        ],
    }


# ── Cloudflare sync ───────────────────────────────────────────────────────────

@app.post("/cloudflare/sync")
async def post_cloudflare_sync(
    req: Request,
    body: CloudflareSyncBody,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    try:
        from src.integrations.cloudflare_client import CloudflareClient
        cf = CloudflareClient()
        counts = cf.sync_records(runtime_multi_records, proxied=body.proxied)
        logger.emit("info", "cloudflare_sync", "cf_sync_complete", counts)
        return {"ok": True, "counts": counts}
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.emit("error", "cloudflare_sync", "cf_sync_failed", {"error": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── AI intelligence status ────────────────────────────────────────────────────

@app.get("/intelligence/anomalies")
def get_anomalies() -> dict:
    return {
        "ok": True,
        "anomalies": _last_anomalies,
        "detector_snapshot": _anomaly_detector.snapshot(),
    }


@app.get("/intelligence/domains")
def get_domain_guardians() -> dict:
    return {"ok": True, "domains": _last_domain_statuses}


@app.post("/intelligence/domains/check")
async def post_domain_check(
    req: Request,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    statuses = _domain_guardian.check_all()
    global _last_domain_statuses
    _last_domain_statuses = [{
        "domain": s.domain, "expiry_days": s.expiry_days,
        "severity": s.severity, "detail": s.detail,
    } for s in statuses]
    return {"ok": True, "domains": _last_domain_statuses}


@app.get("/intelligence/certs")
def get_cert_status() -> dict:
    return {"ok": True, "certs": _last_cert_statuses}


@app.post("/intelligence/certs/check")
async def post_cert_check(
    req: Request,
    x_ghost_approval: str = Header(default=""),
    x_ghost_nonce: str = Header(default=""),
    x_ghost_timestamp: str = Header(default=""),
) -> dict:
    payload = await req.body()
    governance.verify(x_ghost_approval, x_ghost_nonce, x_ghost_timestamp, payload.decode("utf-8"))
    statuses = _acme_manager.all_statuses()
    global _last_cert_statuses
    _last_cert_statuses = statuses
    return {"ok": True, "certs": statuses}


@app.get("/intelligence/summary")
def get_intelligence_summary() -> dict:
    return {
        "ok": True,
        "anomalies": {"count": len(_last_anomalies), "items": _last_anomalies},
        "domains":   {"count": len(_last_domain_statuses), "items": _last_domain_statuses},
        "certs":     {"count": len(_last_cert_statuses), "items": _last_cert_statuses},
        "detector":  _anomaly_detector.snapshot(),
    }


# Domain guardian / cert check run every 6 reconcile cycles (~6 min at default)
_INTELLIGENCE_CHECK_EVERY = max(1, int(os.getenv("GHOSTDNS_INTELLIGENCE_CHECK_EVERY", "6")))
_tick_count = 0


def _autonomous_loop() -> None:
    global _tick_count, _last_domain_statuses, _last_cert_statuses
    while True:
        try:
            reconcile()
        except Exception as exc:
            logger.emit("error", "autonomous_loop", "reconcile_tick_failed", {"error": str(exc)})
        _tick_count += 1
        if _tick_count % _INTELLIGENCE_CHECK_EVERY == 0:
            try:
                domain_statuses = _domain_guardian.check_all()
                _last_domain_statuses = [
                    {"domain": s.domain, "expiry_days": s.expiry_days, "severity": s.severity, "detail": s.detail}
                    for s in domain_statuses
                ]
            except Exception as exc:
                logger.emit("error", "autonomous_loop", "domain_guardian_failed", {"error": str(exc)})
            try:
                cert_statuses = _acme_manager.all_statuses()
                _last_cert_statuses = cert_statuses
            except Exception as exc:
                logger.emit("error", "autonomous_loop", "cert_check_failed", {"error": str(exc)})
        time.sleep(RECONCILE_INTERVAL_SECONDS)


@app.on_event("startup")
def on_startup() -> None:
    thread = threading.Thread(target=_autonomous_loop, name="ghostdns-reconcile-loop", daemon=True)
    thread.start()


@app.middleware("http")
async def recursion_guard(request: Request, call_next):
    if request.url.path in {"/metrics", "/health"}:
        return await call_next(request)

    client_ip = request.client.host if request.client else "127.0.0.1"
    if request.url.path.startswith("/resolve") and not any(
        client_ip.startswith(prefix) for prefix in ("127.", "172.", "192.168.", "10.")
    ):
        GHOSTDNS_RECURSION_DENIED_TOTAL.inc()
        raise HTTPException(status_code=403, detail="recursion_denied")

    return await call_next(request)
