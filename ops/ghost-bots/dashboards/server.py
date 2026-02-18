#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import connect, get_incident_detail, get_open_incidents  # noqa: E402


def _load_last_run() -> dict:
    path = CODE_ROOT / "reports/last_run.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _check_bucket(checks: list[dict], kind: str, layer: str | None = None) -> dict:
    for c in checks:
        if str(c.get("kind")) != kind:
            continue
        if layer is not None and str(c.get("chain_layer") or "") != layer:
            continue
        return {
            "ok": bool(c.get("ok")),
            "title": str(c.get("title") or ""),
            "summary": str(c.get("summary") or ""),
        }
    return {"ok": False, "title": "", "summary": "missing check"}


def _build_summary(db_path: Path) -> dict:
    last = _load_last_run()
    checks = list(last.get("checks") or [])

    with connect(db_path) as conn:
        open_inc = get_open_incidents(conn)

    rpc_by_layer = {
        "L1": _check_bucket(checks, "rpc_health", "L1"),
        "L2": _check_bucket(checks, "rpc_health", "L2"),
        "L3": _check_bucket(checks, "rpc_health", "L3"),
    }
    docker = _check_bucket(checks, "docker_health")
    gst_leakage = _check_bucket(checks, "gst_leakage_gate")
    gst_symbol = _check_bucket(checks, "gst_symbol_gate")

    return {
        "ts": str(last.get("ts") or ""),
        "systemHealth": {
            "docker": docker,
            "rpc": rpc_by_layer,
        },
        "gstCompliance": {
            "leakageGate": gst_leakage,
            "symbolGate": gst_symbol,
        },
        "openIncidentCount": len(open_inc),
        "env": {
            "host": os.uname().nodename if hasattr(os, "uname") else "",
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Ghost Bots incident dashboard server")
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8088)
    ap.add_argument("--html", default=str(CODE_ROOT / "dashboards/incidents.html"))
    args = ap.parse_args()

    db_path = Path(args.db)
    html_path = Path(args.html)

    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, obj: object, code: int = 200) -> None:
            body = json.dumps(obj, ensure_ascii=True).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_text(self, text: str, code: int = 200, content_type: str = "text/html; charset=utf-8") -> None:
            body = text.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt: str, *args: object) -> None:
            # Quiet by default (systemd-friendly)
            return

        def do_GET(self) -> None:  # noqa: N802
            p = urlparse(self.path)

            if p.path in ("/", "/incidents"):
                self._send_text(html_path.read_text(encoding="utf-8"))
                return

            if p.path == "/api/incidents":
                with connect(db_path) as conn:
                    self._send_json({"incidents": get_open_incidents(conn)})
                return

            if p.path.startswith("/api/incidents/"):
                try:
                    inc_id = int(p.path.rsplit("/", 1)[-1])
                except Exception:
                    self._send_json({"error": "bad incident id"}, code=400)
                    return

                try:
                    with connect(db_path) as conn:
                        inc = get_incident_detail(conn, inc_id)
                except KeyError:
                    self._send_json({"error": "not found"}, code=404)
                    return

                self._send_json({"incident": inc})
                return

            if p.path == "/api/summary":
                self._send_json(_build_summary(db_path))
                return

            self._send_json({"error": "not found"}, code=404)

    srv = HTTPServer((args.bind, args.port), Handler)
    print(f"listening on http://{args.bind}:{args.port}")
    srv.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
