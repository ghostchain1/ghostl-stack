#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import (  # noqa: E402
    connect,
    get_patch,
    init_schema,
    insert_verification,
    update_patch_status,
    utc_now_iso,
)
from plugins.sentinel import check_rpc  # noqa: E402


def resolve_repo_root() -> Path:
    env = os.environ.get("GHOST_REPO_ROOT") or os.environ.get("GHOST_BOTS_REPO_ROOT")
    if env:
        return Path(env).resolve()

    cwd = Path.cwd().resolve()
    if (cwd / ".git").exists():
        return cwd

    for p in Path(__file__).resolve().parents:
        if (p / ".git").exists():
            return p
    return cwd


def _write_log(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:
            return str(value)
    return str(value)


def _run_command(cmd: list[str], *, cwd: Path, timeout_seconds: Optional[int]) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout_seconds if timeout_seconds and timeout_seconds > 0 else None,
        )
        return {
            "timedOut": False,
            "exitCode": proc.returncode,
            "stdout": _as_text(proc.stdout),
            "stderr": _as_text(proc.stderr),
        }
    except subprocess.TimeoutExpired as e:
        return {
            "timedOut": True,
            "exitCode": 124,
            "stdout": _as_text(e.stdout),
            "stderr": _as_text(e.stderr),
        }


def _run_gate_cmd(
    name: str,
    cmd: list[str],
    cwd: Path,
    out_dir: Path,
    *,
    timeout_seconds: Optional[int],
) -> dict[str, Any]:
    outcome = _run_command(cmd, cwd=cwd, timeout_seconds=timeout_seconds)
    out_path = out_dir / f"{name}.json"
    ok = (not bool(outcome["timedOut"])) and int(outcome["exitCode"]) == 0
    record = {
        "gate": name,
        "ok": ok,
        "timedOut": bool(outcome["timedOut"]),
        "timeoutSeconds": timeout_seconds,
        "exitCode": int(outcome["exitCode"]),
        "command": cmd,
        "stdout": str(outcome["stdout"])[-12000:],
        "stderr": str(outcome["stderr"])[-12000:],
    }
    _write_log(out_path, record)
    return {
        "gate": name,
        "ok": record["ok"],
        "outputPath": str(out_path),
        "required": True,
    }


def _build_compose_validation_targets(compose_files: list[Path]) -> list[dict[str, Any]]:
    by_name = {p.name: p for p in compose_files}
    used: set[str] = set()
    targets: list[dict[str, Any]] = []

    overlay_re = re.compile(r"^docker-compose\.(.+)\.secrets\.ya?ml$")

    for compose_file in sorted(compose_files, key=lambda p: p.name):
        m = overlay_re.match(compose_file.name)
        if not m:
            continue
        stem = m.group(1)
        base = by_name.get(f"docker-compose.{stem}.yml") or by_name.get(f"docker-compose.{stem}.yaml")
        if base:
            targets.append(
                {
                    "label": f"{base.name}+{compose_file.name}",
                    "files": [base, compose_file],
                    "required": True,
                }
            )
            used.add(base.name)
            used.add(compose_file.name)
        else:
            targets.append(
                {
                    "label": compose_file.name,
                    "files": [compose_file],
                    "required": False,
                    "skipReason": "overlay without matching base compose file",
                }
            )
            used.add(compose_file.name)

    for compose_file in sorted(compose_files, key=lambda p: p.name):
        if compose_file.name in used:
            continue
        targets.append({"label": compose_file.name, "files": [compose_file], "required": True})

    return targets


def _run_compose_gate(repo_root: Path, out_dir: Path, *, timeout_seconds: Optional[int]) -> dict[str, Any]:
    compose_files = sorted(repo_root.glob("docker-compose*.yml")) + sorted(repo_root.glob("docker-compose*.yaml"))
    compose_files = [p for p in compose_files if p.is_file()]

    out_path = out_dir / "compose_config.json"
    if not compose_files:
        _write_log(
            out_path,
            {"gate": "compose_config", "ok": True, "skipped": True, "reason": "no compose files at repo root"},
        )
        return {"gate": "compose_config", "ok": True, "outputPath": str(out_path), "required": False}

    validation_targets = _build_compose_validation_targets(compose_files)
    results: list[dict[str, Any]] = []
    ok = True
    for target in validation_targets:
        files = [Path(f) for f in target["files"]]
        required = bool(target.get("required", True))
        skip_reason = str(target.get("skipReason") or "")
        if skip_reason:
            results.append(
                {
                    "target": str(target["label"]),
                    "files": [str(p) for p in files],
                    "ok": True,
                    "skipped": True,
                    "required": required,
                    "reason": skip_reason,
                }
            )
            continue

        compose_args = " ".join(f"-f {shlex.quote(str(p))}" for p in files)
        cmd = [
            "bash",
            "-lc",
            (
                "set -euo pipefail; "
                f"source {repo_root}/scripts/lib/docker.sh; "
                "hg_docker_init >/dev/null; "
                f"hg_docker compose {compose_args} config >/dev/null"
            ),
        ]
        outcome = _run_command(cmd, cwd=repo_root, timeout_seconds=timeout_seconds)
        ok_target = (not bool(outcome["timedOut"])) and int(outcome["exitCode"]) == 0
        entry = {
            "target": str(target["label"]),
            "files": [str(p) for p in files],
            "ok": ok_target,
            "timedOut": bool(outcome["timedOut"]),
            "timeoutSeconds": timeout_seconds,
            "exitCode": int(outcome["exitCode"]),
            "required": required,
            "stderr": str(outcome["stderr"])[-4000:],
            "stdout": str(outcome["stdout"])[-4000:],
        }
        if not entry["ok"] and required:
            ok = False
        results.append(entry)

    _write_log(out_path, {"gate": "compose_config", "ok": ok, "checks": results})
    return {"gate": "compose_config", "ok": ok, "outputPath": str(out_path), "required": True}


def _run_service_tests(
    repo_root: Path,
    out_dir: Path,
    *,
    skip: bool,
    timeout_seconds: Optional[int],
) -> dict[str, Any]:
    out_path = out_dir / "service_tests.json"
    pkg_path = repo_root / "package.json"
    if skip:
        _write_log(out_path, {"gate": "service_tests", "ok": True, "skipped": True, "reason": "disabled by flag"})
        return {"gate": "service_tests", "ok": True, "outputPath": str(out_path), "required": False}

    if not pkg_path.exists():
        _write_log(out_path, {"gate": "service_tests", "ok": True, "skipped": True, "reason": "no package.json"})
        return {"gate": "service_tests", "ok": True, "outputPath": str(out_path), "required": False}

    package_json = json.loads(pkg_path.read_text(encoding="utf-8"))
    test_script = str((package_json.get("scripts") or {}).get("test") or "").strip()
    if not test_script:
        _write_log(out_path, {"gate": "service_tests", "ok": True, "skipped": True, "reason": "no test script"})
        return {"gate": "service_tests", "ok": True, "outputPath": str(out_path), "required": False}

    cmd: list[str]
    if (repo_root / "pnpm-lock.yaml").exists() and shutil.which("pnpm"):
        cmd = ["pnpm", "-s", "test"]
    elif shutil.which("npm"):
        cmd = ["npm", "test", "--silent"]
    else:
        _write_log(out_path, {"gate": "service_tests", "ok": False, "reason": "no package manager available"})
        return {"gate": "service_tests", "ok": False, "outputPath": str(out_path), "required": True}

    outcome = _run_command(cmd, cwd=repo_root, timeout_seconds=timeout_seconds)
    ok = (not bool(outcome["timedOut"])) and int(outcome["exitCode"]) == 0
    _write_log(
        out_path,
        {
            "gate": "service_tests",
            "ok": ok,
            "timedOut": bool(outcome["timedOut"]),
            "timeoutSeconds": timeout_seconds,
            "exitCode": int(outcome["exitCode"]),
            "command": cmd,
            "stdout": str(outcome["stdout"])[-16000:],
            "stderr": str(outcome["stderr"])[-16000:],
        },
    )
    return {"gate": "service_tests", "ok": ok, "outputPath": str(out_path), "required": True}


def _run_forge(
    repo_root: Path,
    out_dir: Path,
    *,
    skip: bool,
    timeout_seconds: Optional[int],
) -> dict[str, Any]:
    out_path = out_dir / "forge_test.json"
    contracts_dir = repo_root / "contracts"
    if skip:
        _write_log(out_path, {"gate": "forge_test", "ok": True, "skipped": True, "reason": "disabled by flag"})
        return {"gate": "forge_test", "ok": True, "outputPath": str(out_path), "required": False}

    if not contracts_dir.exists():
        _write_log(out_path, {"gate": "forge_test", "ok": True, "skipped": True, "reason": "no contracts directory"})
        return {"gate": "forge_test", "ok": True, "outputPath": str(out_path), "required": False}

    if not shutil.which("forge"):
        _write_log(out_path, {"gate": "forge_test", "ok": False, "reason": "forge command not found"})
        return {"gate": "forge_test", "ok": False, "outputPath": str(out_path), "required": True}

    outcome = _run_command(["forge", "test", "-q"], cwd=contracts_dir, timeout_seconds=timeout_seconds)
    ok = (not bool(outcome["timedOut"])) and int(outcome["exitCode"]) == 0
    _write_log(
        out_path,
        {
            "gate": "forge_test",
            "ok": ok,
            "timedOut": bool(outcome["timedOut"]),
            "timeoutSeconds": timeout_seconds,
            "exitCode": int(outcome["exitCode"]),
            "stdout": str(outcome["stdout"])[-16000:],
            "stderr": str(outcome["stderr"])[-16000:],
        },
    )
    return {"gate": "forge_test", "ok": ok, "outputPath": str(out_path), "required": True}


def _run_rpc_smoke(out_dir: Path) -> list[dict[str, Any]]:
    gates: list[dict[str, Any]] = []
    targets = [
        ("rpc_smoke_l1", check_rpc("http://localhost:18545", layer="L1", expected_chain_id=14000101)),
        ("rpc_smoke_l2", check_rpc("http://localhost:29547", layer="L2", expected_chain_id=901)),
        ("rpc_smoke_l3", check_rpc("http://localhost:39545", layer="L3", expected_chain_id=903)),
    ]
    for gate_name, check in targets:
        out_path = out_dir / f"{gate_name}.json"
        _write_log(out_path, {"gate": gate_name, "ok": check.ok, "summary": check.summary, "payload": check.payload})
        gates.append({"gate": gate_name, "ok": check.ok, "outputPath": str(out_path), "required": True})
    return gates


def _run_dashboard_json_validation(repo_root: Path, out_dir: Path, *, enabled: bool) -> dict[str, Any]:
    out_path = out_dir / "dashboard_json_validation.json"
    if not enabled:
        _write_log(
            out_path,
            {"gate": "dashboard_json_validation", "ok": True, "skipped": True, "reason": "dashboards not touched"},
        )
        return {"gate": "dashboard_json_validation", "ok": True, "outputPath": str(out_path), "required": False}

    dashboard_dirs = [
        repo_root / "grafana" / "dashboards",
        repo_root / "observability" / "grafana" / "dashboards",
    ]
    json_files: list[Path] = []
    for d in dashboard_dirs:
        if d.exists():
            json_files.extend(sorted(d.rglob("*.json")))

    if not json_files:
        _write_log(
            out_path,
            {"gate": "dashboard_json_validation", "ok": True, "skipped": True, "reason": "no dashboard json files"},
        )
        return {"gate": "dashboard_json_validation", "ok": True, "outputPath": str(out_path), "required": False}

    errors: list[dict[str, str]] = []
    for p in json_files:
        try:
            json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            errors.append({"file": str(p), "error": str(e)})

    ok = len(errors) == 0
    _write_log(
        out_path,
        {"gate": "dashboard_json_validation", "ok": ok, "filesChecked": len(json_files), "errors": errors[:100]},
    )
    return {"gate": "dashboard_json_validation", "ok": ok, "outputPath": str(out_path), "required": True}


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify a patch candidate and store gate results.")
    ap.add_argument("--patch-id", type=int, default=0, help="Patch candidate id. 0 runs ad-hoc verification.")
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--schema", default=str(CODE_ROOT / "db/schema.sql"))
    ap.add_argument("--repo-root", default=None)
    ap.add_argument("--skip-service-tests", action="store_true")
    ap.add_argument("--skip-forge", action="store_true")
    ap.add_argument("--gate-timeout-seconds", type=int, default=int(os.environ.get("GHOST_BOTS_GATE_TIMEOUT_SEC", "180")))
    ap.add_argument(
        "--service-test-timeout-seconds",
        type=int,
        default=int(os.environ.get("GHOST_BOTS_SERVICE_TEST_TIMEOUT_SEC", "900")),
    )
    ap.add_argument("--forge-timeout-seconds", type=int, default=int(os.environ.get("GHOST_BOTS_FORGE_TIMEOUT_SEC", "900")))
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else resolve_repo_root()
    db_path = Path(args.db).resolve()
    schema_path = Path(args.schema).resolve()
    ts = utc_now_iso().replace(":", "-")
    patch_key = str(args.patch_id if args.patch_id > 0 else "adhoc")
    out_dir = CODE_ROOT / "reports" / "verify" / patch_key / ts
    out_dir.mkdir(parents=True, exist_ok=True)

    patch_files: list[str] = []
    if args.patch_id > 0:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            patch = get_patch(conn, args.patch_id)
            patch_files = json.loads(str(patch.get("files_json") or "[]"))

    touches_dashboards = any(("grafana" in f or "dashboard" in f) for f in patch_files)
    results: list[dict[str, Any]] = []
    results.append(
        _run_gate_cmd(
            "gst_leakage_gate",
            ["bash", "scripts/gst-leakage-gate.sh"],
            repo_root,
            out_dir,
            timeout_seconds=args.gate_timeout_seconds,
        )
    )
    results.append(
        _run_gate_cmd(
            "gst_symbol_gate",
            ["bash", "scripts/gst-symbol-gate.sh"],
            repo_root,
            out_dir,
            timeout_seconds=args.gate_timeout_seconds,
        )
    )
    results.append(_run_compose_gate(repo_root, out_dir, timeout_seconds=args.gate_timeout_seconds))
    results.append(
        _run_service_tests(
            repo_root,
            out_dir,
            skip=args.skip_service_tests,
            timeout_seconds=args.service_test_timeout_seconds,
        )
    )
    results.append(_run_forge(repo_root, out_dir, skip=args.skip_forge, timeout_seconds=args.forge_timeout_seconds))
    results.extend(_run_rpc_smoke(out_dir))
    results.append(_run_dashboard_json_validation(repo_root, out_dir, enabled=touches_dashboards))

    overall_ok = all(bool(r["ok"]) for r in results if bool(r.get("required", True)))
    summary_path = out_dir / "summary.json"
    _write_log(
        summary_path,
        {
            "ts": utc_now_iso(),
            "patchId": args.patch_id,
            "repoRoot": str(repo_root),
            "overallOk": overall_ok,
            "results": results,
        },
    )

    if args.patch_id > 0:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            for r in results:
                insert_verification(
                    conn,
                    patch_id=args.patch_id,
                    gate_name=str(r["gate"]),
                    ok=bool(r["ok"]),
                    output_path=str(r["outputPath"]),
                )
            update_patch_status(conn, args.patch_id, "verified_passed" if overall_ok else "verified_failed")

    print(str(summary_path))
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
