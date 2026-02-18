#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

CODE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(CODE_ROOT))

from core.db import (  # noqa: E402
    connect,
    get_patch,
    init_schema,
    insert_approval,
    insert_deployment,
    update_patch_status,
)


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


def default_approval_file() -> Path:
    env = os.environ.get("GHOST_BOTS_APPROVAL_FILE")
    if env:
        return Path(env).resolve()
    return (CODE_ROOT / "APPROVE_NEXT_PATCH").resolve()


def _run(cmd: list[str], *, cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, check=check)


def _list_dirty_entries(repo_root: Path) -> list[str]:
    proc = _run(["git", "status", "--porcelain"], cwd=repo_root, check=False)
    if proc.returncode != 0:
        return ["<unable to read git status>"]
    lines = [line.rstrip() for line in (proc.stdout or "").splitlines() if line.strip()]
    return lines


def _parse_approval_file(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"approval file is empty: {path}")

    if text.isdigit():
        return {"patch_id": text, "note": ""}

    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip().lower()] = v.strip()
        elif "patch_id" not in out and line.isdigit():
            out["patch_id"] = line
        else:
            out.setdefault("note", "")
            out["note"] = (out["note"] + " " + line).strip()
    return out


def _sanitize_branch_fragment(value: str) -> str:
    lowered = value.lower()
    lowered = re.sub(r"[^a-z0-9-]+", "-", lowered).strip("-")
    return lowered[:48] or "incident"


def _ensure_branch(repo_root: Path, branch_name: str) -> None:
    exists = subprocess.run(
        ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"],
        cwd=str(repo_root),
        check=False,
    )
    if exists.returncode == 0:
        _run(["git", "checkout", branch_name], cwd=repo_root)
    else:
        _run(["git", "checkout", "-b", branch_name], cwd=repo_root)


def _read_incident_title(conn, incident_id: int) -> str:
    row = conn.execute("SELECT title FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not row:
        return f"incident-{incident_id}"
    return str(row[0])


def _parse_patch_id_from_args(args) -> tuple[int, str, Path]:
    approval_path = Path(args.approval_file).resolve()
    patch_id = int(args.patch_id) if args.patch_id else 0
    note = args.note or ""
    if patch_id > 0:
        return patch_id, note, approval_path

    if not approval_path.exists():
        raise FileNotFoundError(f"approval token not found: {approval_path}")

    parsed = _parse_approval_file(approval_path)
    pid = int(parsed.get("patch_id") or "0")
    if pid <= 0:
        raise ValueError(f"approval token missing valid patch_id: {approval_path}")

    file_note = parsed.get("note") or parsed.get("message") or ""
    merged_note = note or file_note
    return pid, merged_note, approval_path


def _archive_approval_file(path: Path, suffix: str) -> None:
    if not path.exists():
        return
    target = path.with_name(f"{path.name}.{suffix}")
    if target.exists():
        target.unlink()
    path.rename(target)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def main() -> int:
    ap = argparse.ArgumentParser(description="Apply approved patch candidate and commit atomically.")
    ap.add_argument("--patch-id", type=int, default=0, help="Patch candidate id. If omitted, read approval token.")
    ap.add_argument("--note", default="")
    ap.add_argument("--approval-file", default=str(default_approval_file()))
    ap.add_argument("--db", default=str(CODE_ROOT / "db/incidents.sqlite"))
    ap.add_argument("--schema", default=str(CODE_ROOT / "db/schema.sql"))
    ap.add_argument("--repo-root", default=None)
    ap.add_argument("--approver", default=os.environ.get("USER", "ghost"))
    ap.add_argument("--skip-service-tests", action="store_true")
    ap.add_argument("--skip-forge", action="store_true")
    ap.add_argument("--skip-rpc-smoke", action="store_true")
    ap.add_argument("--skip-compose", action="store_true")
    ap.add_argument("--gate-timeout-seconds", type=int, default=_env_int("GHOST_BOTS_GATE_TIMEOUT_SEC", 0))
    ap.add_argument(
        "--service-test-timeout-seconds",
        type=int,
        default=_env_int("GHOST_BOTS_SERVICE_TEST_TIMEOUT_SEC", 0),
    )
    ap.add_argument("--forge-timeout-seconds", type=int, default=_env_int("GHOST_BOTS_FORGE_TIMEOUT_SEC", 0))
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve() if args.repo_root else resolve_repo_root()
    db_path = Path(args.db).resolve()
    schema_path = Path(args.schema).resolve()

    patch_id, note, approval_path = _parse_patch_id_from_args(args)
    dirty_entries = _list_dirty_entries(repo_root)
    if dirty_entries:
        dirty_preview = "; ".join(dirty_entries[:20])
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            get_patch(conn, patch_id)
            insert_approval(
                conn,
                patch_id=patch_id,
                approver=str(args.approver),
                decision="blocked",
                note=f"blocked dirty worktree: {note}".strip(),
            )
            update_patch_status(conn, patch_id, "blocked_dirty_worktree")
            insert_deployment(
                conn,
                patch_id=patch_id,
                method="atomic_commit",
                ok=False,
                notes=f"blocked: dirty worktree ({len(dirty_entries)} entries): {dirty_preview}",
            )
        _archive_approval_file(approval_path, "failed")
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "dirty_worktree",
                    "dirtyEntries": dirty_entries[:20],
                },
                ensure_ascii=True,
            )
        )
        return 1

    with connect(db_path) as conn:
        init_schema(conn, schema_path)
        patch = get_patch(conn, patch_id)
        incident_id = int(patch["incident_id"])
        incident_title = _read_incident_title(conn, incident_id)
        insert_approval(
            conn,
            patch_id=patch_id,
            approver=str(args.approver),
            decision="approved",
            note=note,
        )
        update_patch_status(conn, patch_id, "approved_pending_verification")

    verify_cmd = [
        "python3",
        str(CODE_ROOT / "plugins" / "verify_patch.py"),
        "--patch-id",
        str(patch_id),
        "--db",
        str(db_path),
        "--schema",
        str(schema_path),
        "--repo-root",
        str(repo_root),
    ]
    if args.skip_service_tests:
        verify_cmd.append("--skip-service-tests")
    if args.skip_forge:
        verify_cmd.append("--skip-forge")
    if args.skip_rpc_smoke:
        verify_cmd.append("--skip-rpc-smoke")
    if args.skip_compose:
        verify_cmd.append("--skip-compose")
    if int(args.gate_timeout_seconds) > 0:
        verify_cmd.extend(["--gate-timeout-seconds", str(args.gate_timeout_seconds)])
    if int(args.service_test_timeout_seconds) > 0:
        verify_cmd.extend(["--service-test-timeout-seconds", str(args.service_test_timeout_seconds)])
    if int(args.forge_timeout_seconds) > 0:
        verify_cmd.extend(["--forge-timeout-seconds", str(args.forge_timeout_seconds)])

    verify_proc = _run(verify_cmd, cwd=repo_root, check=False)
    if verify_proc.returncode != 0:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            update_patch_status(conn, patch_id, "verified_failed")
            insert_deployment(
                conn,
                patch_id=patch_id,
                method="atomic_commit",
                ok=False,
                notes="verification failed before commit",
            )
        _archive_approval_file(approval_path, "failed")
        print(verify_proc.stdout.strip() or verify_proc.stderr.strip())
        return 1

    branch_name = f"gst/botfix/{incident_id}-{patch_id}-{_sanitize_branch_fragment(incident_title)}"
    _ensure_branch(repo_root, branch_name)

    _run(["git", "add", "-A"], cwd=repo_root)
    staged = _run(["git", "diff", "--cached", "--name-only"], cwd=repo_root)
    staged_files = [line.strip() for line in (staged.stdout or "").splitlines() if line.strip()]
    if not staged_files:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            update_patch_status(conn, patch_id, "approved_no_changes")
            insert_deployment(
                conn,
                patch_id=patch_id,
                method="atomic_commit",
                ok=False,
                notes="no staged changes for approved patch",
            )
        _archive_approval_file(approval_path, "failed")
        return 1

    guard_proc = _run(["bash", "scripts/guard-diff-only.sh"], cwd=repo_root, check=False)
    if guard_proc.returncode != 0:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            update_patch_status(conn, patch_id, "guard_failed")
            insert_deployment(
                conn,
                patch_id=patch_id,
                method="atomic_commit",
                ok=False,
                notes="diff-only guard failed",
            )
        _archive_approval_file(approval_path, "failed")
        print(guard_proc.stderr.strip() or guard_proc.stdout.strip())
        return 1

    commit_msg = f"gst(bot): fix {incident_title} [incident:{incident_id}] [patch:{patch_id}]"
    commit_proc = _run(["git", "commit", "-m", commit_msg], cwd=repo_root, check=False)
    if commit_proc.returncode != 0:
        with connect(db_path) as conn:
            init_schema(conn, schema_path)
            update_patch_status(conn, patch_id, "commit_failed")
            insert_deployment(
                conn,
                patch_id=patch_id,
                method="atomic_commit",
                ok=False,
                notes="git commit failed",
            )
        _archive_approval_file(approval_path, "failed")
        print(commit_proc.stderr.strip() or commit_proc.stdout.strip())
        return 1

    sha = _run(["git", "rev-parse", "HEAD"], cwd=repo_root).stdout.strip()
    with connect(db_path) as conn:
        init_schema(conn, schema_path)
        update_patch_status(conn, patch_id, "deployed")
        insert_deployment(
            conn,
            patch_id=patch_id,
            method="atomic_commit",
            ok=True,
            notes=f"branch={branch_name} commit={sha}",
        )

    if approval_path.exists():
        approval_path.unlink()

    print(json.dumps({"patchId": patch_id, "branch": branch_name, "commit": sha}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
